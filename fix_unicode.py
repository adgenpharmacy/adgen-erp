import os

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()
    
    orig = text
    text = text.replace('Ã¢â‚¬', '─')
    text = text.replace('Ã¢â€â‚¬', '─')
    text = text.replace('â”€', '─')
    text = text.replace('Â·', '·')
    text = text.replace('Ã‚Â·', '·')
    
    # New ones from reports_screen.dart
    text = text.replace('â•', '═')
    text = text.replace('â€”', '—')
    text = text.replace('Ã¢â€šÂ¹', '₹')
    
    if orig != text:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f'Fixed {filepath}')

for root, dirs, files in os.walk('lib'):
    for file in files:
        if file.endswith('.dart'):
            fix_file(os.path.join(root, file))
