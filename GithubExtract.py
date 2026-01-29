import csv
import requests
import os
from datetime import datetime
import re

def get_total_contributions(username):
    """
    Checks each year from 2024 to the current year directly.
    Returns both the total for 2026 and the lifetime total (sum of 2024 onwards).
    """
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    results = {
        'total_2026': 0,
        'total_lifetime': 0
    }
    
    # We check from 2024 to the current year
    current_year = datetime.now().year
    years_to_check = range(2024, current_year + 1)
    
    print(f"  Checking contributions for {username} from 2024 to {current_year}...")
    
    try:
        for year_int in years_to_check:
            year = str(year_int)
            contrib_url = f"https://github.com/users/{username}/contributions?from={year}-01-01&to={year}-12-31"
            res = requests.get(contrib_url, headers=headers, timeout=10)
            
            if res.status_code == 200:
                # Robust regex for "X contributions in 202X" or "X contributions in the last year"
                # Matches "1,098\n      contributions\n        in 2025" as well
                pattern = rf'([\d,]+)\s+contributions\s+in\s+({year}|the\s+last\s+year)'
                count_match = re.search(pattern, res.text, re.IGNORECASE | re.DOTALL)
                
                if count_match:
                    count = int(count_match.group(1).replace(',', ''))
                    print(f"    {year}: {count} contributions")
                    
                    if year == '2026':
                        results['total_2026'] = count
                    
                    results['total_lifetime'] += count
                else:
                    # If we don't find the count, it might be 0 for that year
                    print(f"    {year}: 0 (or not found)")
            else:
                print(f"    {year}: Error {res.status_code}")
            
        return results

    except Exception as e:
        print(f"Exception scraping contributions for {username}: {e}")
        return None

def extract_username(url):
    """Extracts GitHub username from a URL."""
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
        reader = csv.DictReader(f)
        reader.fieldnames = [name.strip() for name in reader.fieldnames]
        for row in reader:
            row = {k.strip(): v.strip() for k, v in row.items()}
            users_to_track.append(row)

    # Load existing results if they exist
    existing_data = {}
    fieldnames = ['Name', 'Dept', 'Link']
    
    if os.path.exists(output_file):
        with open(output_file, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            fieldnames = reader.fieldnames
            # Backward compatibility: rename 'total' to 'total_2026' if it exists
            if 'total' in fieldnames:
                fieldnames = [f if f != 'total' else 'total_2026' for f in fieldnames]
            
            for row in reader:
                # If the row has a 'total' key, move it to 'total_2026'
                if 'total' in row:
                    row['total_2026'] = row.pop('total')
                existing_data[row['Link']] = row

    # Ensure required total columns exist
    if 'total_2026' not in fieldnames:
        fieldnames.append('total_2026')
    if 'total_lifetime' not in fieldnames:
        fieldnames.append('total_lifetime')

    # Ensure today's date column is inserted before the total columns
    if today_str not in fieldnames:
        insert_idx = fieldnames.index('total_2026')
        fieldnames.insert(insert_idx, today_str)

    updated_rows = []
    for user in users_to_track:
        name = user['Name']
        dept = user['Dept']
        link = user['Link']
        username = extract_username(link)
        
        print(f"Fetching data for {name} ({username})...")
        contrib_data = get_total_contributions(username)
        
        row = existing_data.get(link, {'Name': name, 'Dept': dept, 'Link': link})
        
        if contrib_data:
            current_2026 = contrib_data['total_2026']
            current_lifetime = contrib_data['total_lifetime']
            
            # Calculate daily diff based on total_2026
            prev_total_2026_str = row.get('total_2026', '0')
            try:
                prev_total_2026 = int(prev_total_2026_str) if prev_total_2026_str else 0
            except ValueError:
                prev_total_2026 = 0
            
            # Diff calculation
            if 'total_2026' not in row or not row['total_2026']:
                diff = current_2026
            else:
                diff = current_2026 - prev_total_2026
                
            row[today_str] = diff
            row['total_2026'] = current_2026
            row['total_lifetime'] = current_lifetime
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
