import fs from 'fs';
import path from 'path';

const API_KEY = 'AIzaSyCKQ6zsTYAYtQnZ8L1dQOpBGTjrODK0y4A';
const PROJECT_ID = 'adgen-pharmacy';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function parseFirestoreFields(fields: any): any {
  if (!fields) return {};
  const obj: any = {};

  for (const key of Object.keys(fields)) {
    const val = fields[key];
    if (val.stringValue !== undefined) obj[key] = val.stringValue;
    else if (val.integerValue !== undefined) obj[key] = parseInt(val.integerValue);
    else if (val.doubleValue !== undefined) obj[key] = parseFloat(val.doubleValue);
    else if (val.booleanValue !== undefined) obj[key] = val.booleanValue;
    else if (val.timestampValue !== undefined) obj[key] = val.timestampValue;
    else if (val.nullValue !== undefined) obj[key] = null;
    else if (val.mapValue !== undefined) obj[key] = parseFirestoreFields(val.mapValue.fields);
    else if (val.arrayValue !== undefined) {
      obj[key] = (val.arrayValue.values || []).map((item: any) => {
        if (item.stringValue !== undefined) return item.stringValue;
        if (item.integerValue !== undefined) return parseInt(item.integerValue);
        if (item.doubleValue !== undefined) return parseFloat(item.doubleValue);
        if (item.booleanValue !== undefined) return item.booleanValue;
        if (item.mapValue !== undefined) return parseFirestoreFields(item.mapValue.fields);
        return item;
      });
    }
  }
  return obj;
}

async function fetchCollection(collectionName: string) {
  console.log(`📡 Fetching collection '${collectionName}' from Firebase Firestore...`);
  let docs: any[] = [];
  let pageToken: string | null = null;

  try {
    do {
      const url: string = `${BASE_URL}/${collectionName}?key=${API_KEY}&pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const response = await fetch(url);
      const data: any = await response.json();

      if (data.error) {
        console.error(`⚠️ Firestore error on '${collectionName}':`, data.error.message);
        break;
      }
      
      const documents = data.documents || [];
      for (const d of documents) {
        const id = d.name.split('/').pop();
        const parsed = parseFirestoreFields(d.fields);
        parsed.id = id;
        parsed._id = id;
        parsed.createTime = d.createTime;
        parsed.updateTime = d.updateTime;
        docs.push(parsed);
      }

      pageToken = data.nextPageToken || null;
    } while (pageToken);

    console.log(`✅ Fetched ${docs.length} documents from '${collectionName}'.`);
    return docs;
  } catch (err: any) {
    console.error(`⚠️ Error fetching '${collectionName}':`, err.message);
    return [];
  }
}

async function main() {
  console.log('🚀 Connecting to Firebase Firestore API...');

  const collections = ['products', 'parties', 'inventory', 'purchase_bills', 'sales_bills', 'users'];
  const dataDir = path.join(__dirname, '../../data/live_firebase_export');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  for (const col of collections) {
    const docs = await fetchCollection(col);
    const filePath = path.join(dataDir, `${col}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ collection: col, count: docs.length, docs }, null, 2));
    console.log(`💾 Saved ${docs.length} docs to ${filePath}`);
  }

  console.log('🎉 Live Firebase export completed!');
}

main();
