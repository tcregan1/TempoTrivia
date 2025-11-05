from typing import Iterable, Optional, Tuple
from sentry_sdk import get_client
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials, SpotifyOAuth
from dotenv import load_dotenv
from itertools import islice
from database import Database
from dataclasses import dataclass
import deezer
import json
import os
load_dotenv()

SPOTIFY_SCOPES = os.getenv(
    "SPOTIFY_SCOPES",
    "playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private"
)
SPOTIFY_REDIRECT_URI = os.getenv("SPOTIPY_REDIRECT_URI", "http://127.0.0.1:8888/callback")
DEFAULT_PLAYLIST_NAME = os.getenv("DEFAULT_INGEST_PLAYLIST", "Normal Mode")

@dataclass
class TrackIn:
    title:str
    artists: list[str]
    
@dataclass
class TrackOut:
    title: str
    artist:str
    deezer_track_id: str
    preview_url: str

def get_spotify_client() -> spotipy.Spotify:
    auth = SpotifyOAuth(
        client_id=os.getenv("SPOTIFY_CLIENT_ID"),
        client_secret=os.getenv("SPOTIFY_CLIENT_SECRET"),
        redirect_uri=SPOTIFY_REDIRECT_URI,
        scope=SPOTIFY_SCOPES,
        open_browser=True,
        cache_path=".cache-spotify-ingest",
        show_dialog=True,
    )
    return spotipy.Spotify(auth_manager=auth)

def get_artist_id_by_name(sp: spotipy.Spotify, name: str) -> Optional[str]:
    q = f'artist:"{name}"'
    res = sp.search(q=q, type="artist", limit=5)
    items = res.get("artists", {}).get("items", [])
    if not items:
        return None
    exact = next((a for a in items if a["name"].lower() == name.lower()), None)
    artist = exact or max(items, key=lambda a: a.get("popularity", 0))
    return artist["id"]

def get_artist_image_url(sp: spotipy.Spotify, artist_name: str) -> Optional[str]:
    artist_id = get_artist_id_by_name(sp, artist_name)
    if not artist_id:
        return None  # artist not found
    artist_obj = sp.artist(artist_id)  # <-- fetch the full artist object
    images = artist_obj.get("images", [])
    return images[0]["url"] if images else None
    
def get_user_playlists(sp: spotipy.Spotify) -> list[dict]:
    """Fetch all playlists for the authenticated user."""
    playlists = []
    offset = 0
    while True:
        
        page = sp.current_user_playlists(limit=50, offset=offset)
        for item in page.get("items", []):
            playlists.append({
                "id": item["id"],
                "name": item["name"],
                "tracks_total": item["tracks"]["total"],
                "owner": item["owner"]["display_name"],
            })
        if not page.get("next"):
            break
        offset += 50
    return playlists


def _iter_playlist_tracks(sp: spotipy.Spotify, playlist_id:str) -> Iterable[TrackIn]:
    offset = 0
    while True:
        page = sp.playlist_items(
            playlist_id,
            limit=100,
            offset=offset,
            additional_types=("track",),
            fields="items(track(name,artists(name),type)),next",
        )
        for it in page.get("items", []):
            t = it.get("track")
            if not t or t.get("type") != "track":
                continue
            title = (t.get("name") or "").strip()
            artists = [a.get("name", "") for a in (t.get("artists") or []) if a.get("name")]
            if title and artists:
                yield TrackIn(title=title, artists=artists)
        if not page.get("next"):
            break
        offset += 100


def _resolve_deezer(dz: deezer.Client, title: str, artist: str) -> Optional[TrackOut]:
    q = f"{title} {artist}"
    results = dz.search(q) or []
    if not results:
        return None
    best = results[0]
    return TrackOut(
        title=best.title,
        artist=best.artist.name,
        deezer_track_id=str(best.id),
        preview_url=best.preview,
    )


def _get_or_create_db_playlist(name: str) -> dict:
    existing = Database.get_all_playlists()
    found = next((p for p in existing if p.get("name") == name), None)
    if found:
        return found
    created = Database.create_playlist(name=name, is_default=True, description="Imported from Spotify")[0]
    return created

def _upsert_and_link(track: TrackOut, playlist_id: int) -> Tuple[bool, bool]:
    existing = Database.search_songs(track.title)
    match = next((s for s in existing if s["artist"].lower() == track.artist.lower()), None)
    if match:
        song_id = match["id"]
        added = False
    else:
        song = Database.create_song(
            title=track.title,
            artist=track.artist,
            preview_url=track.preview_url or "",
            deezer_track_id=track.deezer_track_id,
        )[0]
        song_id = song["id"]
        added = True
    try:
        Database.add_song_to_playlist(playlist_id=playlist_id, song_id=song_id)
        linked = True
    except Exception as e:
        msg = str(e).lower()
        if "duplicate" in msg or "unique" in msg:
            linked = False
        else:
            raise
    return added, linked

def ingest_spotify_playlist(spotify_playlist_id: str, target_playlist_name: str = DEFAULT_PLAYLIST_NAME) -> dict:
    sp = get_spotify_client()
    dz = deezer.Client()
    target = _get_or_create_db_playlist(target_playlist_name)
    pid = target["id"]

    added = linked = missing = total = 0
    for tr in _iter_playlist_tracks(sp, spotify_playlist_id):
        total += 1
        resolved = _resolve_deezer(dz, tr.title, tr.artists[0])
        if not resolved:
            missing += 1
            continue
        a, l = _upsert_and_link(resolved, pid)
        added += int(a)
        linked += int(l)

    return {
        "target_playlist_id": pid,
        "spotify_playlist_id": spotify_playlist_id,
        "total_seen": total,
        "added_new_songs": added,
        "linked_to_playlist": linked,
        "unmatched_on_deezer": missing,
    }
    
    
from typing import Iterable
import spotipy

def unfollow_all_except(
    sp: spotipy.Spotify,
    keep_names: Iterable[str],
    case_sensitive: bool = False
) -> int:
    """
    Unfollow all playlists except those whose names are in keep_names.
    Returns the number of playlists unfollowed.
    """
    if not keep_names:
        raise ValueError("keep_names must contain at least one playlist name to keep.")

    # Build a fast-lookup set of names to keep
    if case_sensitive:
        keep = {name for name in keep_names}
        def match(name: str) -> bool:
            return name in keep
    else:
        keep = {name.casefold() for name in keep_names}
        def match(name: str) -> bool:
            return name.casefold() in keep

    unfollowed = 0
    results = sp.current_user_playlists(limit=50)

    while True:
        for pl in results["items"]:
            pl_name = pl.get("name") or ""
            pl_id = pl["id"]

            # Keep if the name is on the allow-list; otherwise unfollow
            if not match(pl_name):
                sp.current_user_unfollow_playlist(pl_id)
                unfollowed += 1
                print(f"Unfollowed: {pl_name} ({pl_id})")
            else:
                print(f"Kept:       {pl_name} ({pl_id})")

        # Pagination
        if results.get("next"):
            results = sp.next(results)
        else:
            break

    print(f"Done. Unfollowed {unfollowed} playlist(s).")
    return unfollowed



def pg_flow(sp:spotipy.Spotify):
    print("Fetching your Spotify playlists...\n")
    playlists = get_user_playlists(sp)
    
    if not playlists:
        print("No playlists found!")
        sys.exit(1)
    
    # Display playlists with numbers
    for idx, pl in enumerate(playlists, 1):
        print(f"{idx}. {pl['name']} ({pl['tracks_total']} tracks) - by {pl['owner']}")
    
    # Let user pick
    choice = input("\nEnter playlist number (or paste playlist ID): ").strip()
    
    # Check if they entered a number or an ID
    if choice.isdigit() and 1 <= int(choice) <= len(playlists):
        pl_id = playlists[int(choice) - 1]["id"]
        pl_name = playlists[int(choice) - 1]["name"]
        print(f"\nSelected: {pl_name}")
    else:
        pl_id = choice
    
    
    playlist_name = input("Enter a name for the playlist: ")
    summary = ingest_spotify_playlist(pl_id, playlist_name)
    print("\n" + "="*50)
    print("IMPORT SUMMARY")
    print("="*50)
    print(json.dumps(summary, indent=2))
    
def debug_list(sp):
    me = sp.me()
    print("User:", me["id"])
    owners = {}
    results = sp.current_user_playlists(limit=50)
    while True:
        for pl in results["items"]:
            owner_id = (pl.get("owner") or {}).get("id")
            owners.setdefault(owner_id, []).append(pl["name"])
        if results.get("next"):
            results = sp.next(results)
        else:
            break

    print("\nOwners seen:", list(owners.keys())[:10], "…")
    print("\nPlaylists owned by 'spotify' that you FOLLOW:")
    for name in owners.get("spotify", []):
        print(" -", name)



if __name__ == "__main__":
    import sys
    
    sp = get_spotify_client()
    pg_flow(sp)
    






