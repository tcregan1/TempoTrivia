import os
from sqlite3 import Cursor 
from supabase import create_client, Client
from dotenv import load_dotenv
from urllib.parse import quote
import random
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY")

supabase: Client  = create_client(SUPABASE_URL, SUPABASE_KEY)

class Database:
    @staticmethod
    def get_client():
        return supabase
    
    @staticmethod
    def create_user(username, spotify_id=None):
        data = {
            "username": username,
            "spotify_id": spotify_id
        }
        response = supabase.table("users").insert(data).execute()
        return response.data
    @staticmethod
    def get_user(user_id):
        response = supabase.table("users").select("*").eq("id", user_id).execute()
        return response.data[0] if response.data else None  
    
    @staticmethod
    def create_playlist(name, creator_id=None, is_default=False, description=None):
        data = {
            "name":name,
            "creator_id":creator_id,
            "is_default":is_default, 
            "description":description
        }
        response = supabase.table("playlists").insert(data).execute()
        return response.data

    
    @staticmethod
    def get_all_playlists():
        """Get all playlists"""
        response = supabase.table("playlists").select("*").execute()
        return response.data
    @staticmethod
    def search_songs(query):
        """Search songs by title or artist"""
        # URL-encode the query to handle special characters like (), &, etc.
        safe_query = quote(query, safe='')
        response = supabase.table("songs").select("*").or_(
            f"title.ilike.%{safe_query}%,artist.ilike.%{safe_query}%"
        ).execute()
        return response.data
    @staticmethod
    def create_song(title, artist, preview_url, deezer_track_id):
        """Create a new song"""
        data = {
            "title": title,
            "artist": artist,
            "preview_url": preview_url,
            "deezer_track_id": deezer_track_id,
        }
        response = supabase.table("songs").insert(data).execute()
        return response.data
    
    @staticmethod
    def get_song(song_id):
        """Get song by ID"""
        response = supabase.table("songs").select("*").eq("id", song_id).execute()
        return response.data[0] if response.data else None
    
    @staticmethod
    def get_random_song_exclude_ids(playlist_id, excluded_ids):
        """Get a random song from a specific playlist, excluding certain songs."""
    
        query = (
             supabase.table("playlist_songs")
            .select("songs(*)") 
            .eq("playlist_id", playlist_id)
        )

 
        if excluded_ids:
            query = query.not_.in_("song_id", excluded_ids)

   
        response = query.execute()
        data = response.data

   
        if not data:
            return None  
        return random.choice([item["songs"] for item in data])

    
    @staticmethod
    def add_song_to_playlist(playlist_id, song_id):
        """Add a song to a playlist"""
        data = {
            "playlist_id": playlist_id,
            "song_id": song_id
        }
        response = supabase.table("playlist_songs").insert(data).execute()
        return response.data
    @staticmethod
    def get_playlist_songs(playlist_id):
        """Get all songs in a playlist"""
        response = supabase.table("playlist_songs").select(
            "songs(*)"
        ).eq("playlist_id", playlist_id).execute()
        return [item["songs"] for item in response.data]