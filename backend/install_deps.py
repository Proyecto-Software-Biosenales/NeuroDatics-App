#!/usr/bin/env python3
"""
Script to install dependencies for NeuroDatics backend
"""
import subprocess
import sys
import os

def run_command(command, description):
    """Run a command and handle errors"""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed:")
        print(f"Error: {e.stderr}")
        return False

def main():
    """Main installation process"""
    print("🚀 Installing NeuroDatics Backend Dependencies")
    print("=" * 50)
    
    # Change to backend directory
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    
    # Install dependencies
    dependencies = [
        "fastapi==0.104.1",
        "uvicorn[standard]==0.24.0",
        "sqlalchemy==2.0.23",
        "asyncpg==0.29.0",
        "alembic==1.12.1",
        "pydantic[email]==2.5.0",
        "pydantic-settings==2.1.0",
        "pyjwt[crypto]==2.8.0",
        "httpx==0.25.2",
        "cryptography==41.0.7",
        "google-api-python-client==2.108.0",
        "google-auth==2.23.4",
        "python-multipart==0.0.6"
    ]
    
    for dep in dependencies:
        if not run_command(f"pip install {dep}", f"Installing {dep.split('==')[0]}"):
            print(f"❌ Failed to install {dep}")
            sys.exit(1)
    
    print("\n🎉 All dependencies installed successfully!")
    print("\nNext steps:")
    print("1. Configure your .env file with proper values")
    print("2. Set up your PostgreSQL database")
    print("3. Run: alembic upgrade head")
    print("4. Run: python -m neurodatics.main")

if __name__ == "__main__":
    main()