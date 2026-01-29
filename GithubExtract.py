import csv
import requests
import os
from datetime import datetime
import re

def get_total_contributions(username):
    """
    Scrapes the user's profile to find all contribution years,
    then sums the contributions from each year to get the lifetime total.
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        # 1. Get the main profile page to find all available years
        profile_url = f"https://github.com/{username}"
        response = requests.get(profile_url, headers=headers, timeout=15)
        if response.status_code != 200:
            print(f"Error fetching profile for {username}: {response.status_code}")
            return None
            
        content = response.text
        # Find all year links like /username?tab=overview&from=2023-12-01&to=2023-12-31
        # The user provided HTML shows links with ids like "year-link-2026"
        years = re.findall(r'id="year-link-(\d+)"', content)
        
        if not years:
            # Fallback: if no year sidebar, just try the current page's count
            years = [str(datetime.now().year)]
            
        total_lifetime = 0
        print(f"  Found years for {username}: {', '.join(years)}")
        
        for year in years:
            # GitHub has a specific endpoint for the contribution graph fragment
            # This is faster and cleaner than fetching the whole profile again
            contrib_url = f"https://github.com/users/{username}/contributions?from={year}-01-01&to={year}-12-31"
            res = requests.get(contrib_url, headers=headers, timeout=10)
            if res.status_code == 200:
                # Look for "274 contributions in 2026"
                match = re.search(r'([\d,]+)\s+contributions\s+in\s+' + year, res.text, re.IGNORECASE)
                if match:
                    count = int(match.group(1).replace(',', ''))
                    total_lifetime += count
                else:
                    # Sometimes the wording is slightly different if it's the current year/range
                    match = re.search(r'([\d,]+)\s+contributions\s+in\s+the\s+last\s+year', res.text, re.IGNORECASE)
                    if match:
                        count = int(match.group(1).replace(',', ''))
                        total_lifetime += count
            
        return total_lifetime

    except Exception as e:
        print(f"Exception scraping contributions for {username}: {e}")
        return None

def extract_username(url):
    """Extracts GitHub username from a URL."""
    # Handles https://github.com/username or github.com/username/ etc.
    parts = url.rstrip('/').split('/')
    return parts[-1]

def process_extraction():
    input_file = 'GitHubLinks.csv'
    output_file = 'ExtractionResult.csv'
    today_str = datetime.now().strftime('%d.%m.%Y')

    if not os.path.exists(input_file):
        print(f"Input file {input_file} not found.")
        return

    # Read input data
    users_to_track = []
    with open(input_file, mode='r', encoding='utf-8') as f:
        # We strip header names to avoid issues with hidden spaces
        reader = csv.DictReader(f)
        reader.fieldnames = [name.strip() for name in reader.fieldnames]
        for row in reader:
            # Also strip values
            row = {k.strip(): v.strip() for k, v in row.items()}
            users_to_track.append(row)

    # Load existing results if they exist
    existing_data = {}
    fieldnames = ['Name', 'Dept', 'Link']
    
    if os.path.exists(output_file):
        with open(output_file, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            for row in reader:
                existing_data[row['Link']] = row

    # Ensure fieldnames has the new date and 'total'
    if today_str not in fieldnames:
        # Insert today's date before the 'total' column if 'total' exists
        if 'total' in fieldnames:
            total_index = fieldnames.index('total')
            fieldnames.insert(total_index, today_str)
        else:
            fieldnames.append(today_str)
            fieldnames.append('total')
    
    if 'total' not in fieldnames:
        fieldnames.append('total')

    updated_rows = []
    for user in users_to_track:
        name = user['Name']
        dept = user['Dept']
        link = user['Link']
        username = extract_username(link)
        
        print(f"Fetching data for {name} ({username})...")
        current_total = get_total_contributions(username)
        
        row = existing_data.get(link, {'Name': name, 'Dept': dept, 'Link': link})
        
        if current_total is not None:
            # Calculate diff
            prev_total_str = row.get('total', '0')
            try:
                prev_total = int(prev_total_str) if prev_total_str else 0
            except ValueError:
                prev_total = 0
            
            # If it's the first time (no total yet), diff is the current_total
            # Otherwise, diff is current_total - prev_total
            if 'total' not in row or not row['total']:
                diff = current_total
            else:
                diff = current_total - prev_total
                
            row[today_str] = diff
            row['total'] = current_total
        else:
            row[today_str] = "Error"
            
        updated_rows.append(row)

    # Write back to CSV
    with open(output_file, mode='w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(updated_rows)

    print(f"Successfully updated {output_file}")

if __name__ == "__main__":
    process_extraction()
