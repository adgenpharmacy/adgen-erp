import pandas as pd
import json
import math

df = pd.read_excel('data/hsncodemaster.xls')
products = []

for index, row in df.iterrows():
    if pd.isna(row['Name']):
        continue
        
    gst = 0.0
    try:
        if not pd.isna(row['CGST']) and not pd.isna(row['SGST']):
            gst = float(row['CGST']) + float(row['SGST'])
    except:
        pass
        
    mrp = 0.0
    try:
        val = float(row['M.R.P.'])
        if not math.isnan(val): mrp = val
    except:
        pass
        
    rate = 0.0
    try:
        val = float(row['P.Rate'])
        if not math.isnan(val): rate = val
    except:
        pass

    hsn = str(row['HSNCode']) if not pd.isna(row['HSNCode']) else "BLANK"
    company = str(row['Company']) if not pd.isna(row['Company']) else ""

    products.append({
        "id": str(row['ItemID']),
        "name": str(row['Name']),
        "companyName": company,
        "hsnCode": hsn,
        "gstPercent": gst,
        "productType": "others",
        "division": "general",
        "packSize": 1,
        "packUnit": "Unit",
        "contentUnit": "Unit",
        "isActive": True,
        "genericName": "",
        "mrp": mrp,
        "rate": rate
    })

out_path = 'data/products_import.json'
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump({"products": products}, f)

print(f"Generated {len(products)} products with MRP and Rate to {out_path}")
