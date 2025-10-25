import deezer
from database import Database

client = deezer.Client()

songs_to_search = [
    "Fly Away Lenny Kravitz",
    "Blossoms Taio Cruz",
    "Even Flow Pearl Jam",
    "Sweater Weather The Neighbourhood",
    "Let It Happen Tame Impala",
    "Out of Love lil tecca",  
    "Dream On Aerosmith",
    "Mr. Brightside The Killers",  
    "Take On Me a-ha",  
    "Everlong Foo Fighters"  
]

print("Searching Deezer for preview URLs...\n")
print("="*80)

songs_data = []

for search_query in songs_to_search:
    try:
        # Search for the song
        results = client.search(search_query)
        
        if results:
            track = results[0]  # Get first result
            
            title = track.title
            artist = track.artist.name
            preview_url = track.preview
            deezer_id = track.id
            duration = track.duration
            
            # Store the data
            song_data = {
                'title': title,
                'artist': artist,
                'preview_url': preview_url,
                'deezer_id': deezer_id,
                'duration_seconds': 30
            }
            songs_data.append(song_data)
            
            # Print results
            print(f"  {title} - {artist}")
            print(f"  Preview: {preview_url}")
            print(f"  Deezer ID: {deezer_id}")
            print(f"  Duration: {duration}s")
            print("-"*80)
        else:
            print(f"✗ No results for: {search_query}")
            print("-"*80)
            
    except Exception as e:
        print(f"✗ Error searching '{search_query}': {e}")
        print("-"*80)

print(f"\nFound {len(songs_data)} songs with previews")
print("\n" + "="*80)
print("\nAdding to database...")
print("="*80 + "\n")


added = 0
skipped = 0

for song in songs_data:
    try:
        # Check if song already exists (avoid duplicates)
        existing = Database.search_songs(song['title'])
        
        if existing and any(s['artist'].lower() == song['artist'].lower() for s in existing):
            print(f"Skipped (already exists): {song['title']} - {song['artist']}")
            skipped += 1
        else:
            # Add to database
            result = Database.create_song(
                title=song['title'],
                artist=song['artist'],
                preview_url=song['preview_url'],
                deezer_track_id=str(song['deezer_id']),  # Store Deezer ID here
            )
            print(f"✓ Added: {song['title']} - {song['artist']}")
            added += 1
            
    except Exception as e:
        print(f"Error adding '{song['title']}': {e}")

print("\n" + "="*80)
print(f"✓ Complete!")
print(f"  Added: {added}")
print(f"  Skipped: {skipped}")
print("="*80)

# Now add them to the default "Normal Mode" playlist
print("\nAdding songs to 'Normal Mode' playlist...")

try:
    # Get the default playlist (or create it if it doesn't exist)
    playlists = Database.get_all_playlists()
    default_playlist = next((p for p in playlists if p.get('is_default')), None)
    
    if not default_playlist:
        print("Creating 'Normal Mode' playlist...")
        default_playlist = Database.create_playlist(
            name="Normal Mode",
            is_default=True,
            description="Default curated songs"
        )[0]
        print(f"Created playlist (ID: {default_playlist['id']})")
    else:
        print(f"Found playlist (ID: {default_playlist['id']})")
    
    # Get all songs from database
    all_songs = []
    for song in songs_data:
        results = Database.search_songs(song['title'])
        if results:
            matching = next((s for s in results if s['artist'].lower() == song['artist'].lower()), None)
            if matching:
                all_songs.append(matching)
    
    # Add each song to the playlist
    linked = 0
    for song in all_songs:
        try:
            Database.add_song_to_playlist(
                playlist_id=default_playlist['id'],
                song_id=song['id']
            )
            print(f"  ✓ Linked: {song['title']}")
            linked += 1
        except Exception as e:
            # Might already be linked, that's okay
            if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                print(f"Already linked: {song['title']}")
            else:
                print(f"Error linking '{song['title']}': {e}")
    
    print(f"\n✓ Linked {linked} songs to 'Normal Mode' playlist")
    
except Exception as e:
    print(f"Error with playlist: {e}")

print("\n" + "="*80)
print("Your database is ready!")
print("="*80)