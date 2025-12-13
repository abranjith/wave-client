/**
 * Test script to verify collection parsing functionality
 */

import { prepareCollection, getFolderPathOptions } from '../src/utils/collectionParser';
import { Collection, CollectionItem, FolderPathOption, isFolder, isRequest } from '../src/types/collection';
import * as fs from 'fs';
import * as path from 'path';

// Test with the sample collections
const sampleCollectionPath = path.join(__dirname, '..', '.github', 'samplecollection.json');
const comprehensiveCollectionPath = path.join(__dirname, '..', '.github', 'comprehensive-collection.json');
const defaultCollectionPath = path.join(__dirname, '..', '.github', 'default-collection.json');

/**
 * Recursively counts folders and requests in a collection
 */
function countItems(items: CollectionItem[]): { folders: number; requests: number } {
  let folders = 0;
  let requests = 0;
  for (const item of items) {
    if (isFolder(item)) {
      folders++;
      const nested = countItems(item.item!);
      folders += nested.folders;
      requests += nested.requests;
    } else if (isRequest(item)) {
      requests++;
    }
  }
  return { folders, requests };
}

/**
 * Recursively prints the folder/request structure
 */
function printStructure(items: CollectionItem[], indent: string = '   '): void {
  items.forEach((item, index) => {
    if (isFolder(item)) {
      const requestCount = countItems(item.item!).requests;
      console.log(`${indent}📁 ${item.name} (${requestCount} requests)`);
      if (item.item && item.item.length > 0) {
        printStructure(item.item, indent + '   ');
      }
    } else if (isRequest(item)) {
      console.log(`${indent}📄 ${item.request?.method || 'GET'} ${item.name}`);
    }
  });
}

function testCollectionParsing() {
  console.log('Testing Collection Parsing with Nested Structure...\n');
  
  // Test default collection
  try {
    const defaultData = fs.readFileSync(defaultCollectionPath, 'utf8');
    const defaultCollection: Collection = JSON.parse(defaultData);
    const parsed = prepareCollection(defaultCollection, 'default.json');
    const counts = countItems(parsed.item);
    
    console.log('✅ Default Collection Parsed Successfully');
    console.log(`   - Name: ${parsed.info.name}`);
    console.log(`   - Folders: ${counts.folders}`);
    console.log(`   - Total Requests: ${counts.requests}`);
    
    // Show folder structure
    console.log('📁 Default Collection Structure:');
    printStructure(parsed.item);
    
    // Show available folder paths
    const folderPaths = getFolderPathOptions(parsed);
    console.log('📂 Available Folder Paths:');
    folderPaths.forEach((fp: FolderPathOption) => console.log(`   - ${fp.displayPath}`));
    console.log('');
    
  } catch (error) {
    console.error('❌ Error parsing default collection:', error);
  }
  
  // Test comprehensive collection (non-default)
  try {
    const comprehensiveData = fs.readFileSync(comprehensiveCollectionPath, 'utf8');
    const comprehensiveCollection: Collection = JSON.parse(comprehensiveData);
    const parsed = prepareCollection(comprehensiveCollection, 'Ecommerce_API.json');
    const counts = countItems(parsed.item);
    
    console.log('✅ E-commerce API Collection Parsed Successfully');
    console.log(`   - Name: ${parsed.info.name}`);
    console.log(`   - Folders: ${counts.folders}`);
    console.log(`   - Total Requests: ${counts.requests}`);
    
    // Show folder structure
    console.log('📁 E-commerce API Collection Structure:');
    printStructure(parsed.item);
    
    // Show available folder paths
    const folderPaths = getFolderPathOptions(parsed);
    console.log('📂 Available Folder Paths:');
    folderPaths.forEach((fp: FolderPathOption) => console.log(`   - ${fp.displayPath}`));
    console.log('');
    
  } catch (error) {
    console.error('❌ Error parsing comprehensive collection:', error);
  }
  
  // Test sample collection
  try {
    const sampleData = fs.readFileSync(sampleCollectionPath, 'utf8');
    const sampleCollection: Collection = JSON.parse(sampleData);
    const parsed = prepareCollection(sampleCollection, 'Sample_Collection.json');
    const counts = countItems(parsed.item);
    
    console.log('✅ Sample Collection Parsed Successfully');
    console.log(`   - Name: ${parsed.info.name}`);
    console.log(`   - Folders: ${counts.folders}`);
    console.log(`   - Total Requests: ${counts.requests}`);
    
    // Show folder structure
    console.log('📁 Sample Collection Structure:');
    printStructure(parsed.item);
    
    // Show available folder paths
    const folderPaths = getFolderPathOptions(parsed);
    console.log('📂 Available Folder Paths:');
    folderPaths.forEach((fp: FolderPathOption) => console.log(`   - ${fp.displayPath}`));
    
  } catch (error) {
    console.error('❌ Error parsing sample collection:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testCollectionParsing();
}

export { testCollectionParsing };
