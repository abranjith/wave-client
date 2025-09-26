/**
 * Test script to verify collection parsing functionality
 */

import { parseCollection } from '../src/utils/collectionParser';
import { Collection } from '../src/types/collection';
import * as fs from 'fs';
import * as path from 'path';

// Test with the sample collections
const sampleCollectionPath = path.join(__dirname, '..', '.github', 'samplecollection.json');
const comprehensiveCollectionPath = path.join(__dirname, '..', '.github', 'comprehensive-collection.json');
const defaultCollectionPath = path.join(__dirname, '..', '.github', 'default-collection.json');

function testCollectionParsing() {
  console.log('Testing Collection Parsing with Flattened Structure...\n');
  
  // Test default collection
  try {
    const defaultData = fs.readFileSync(defaultCollectionPath, 'utf8');
    const defaultCollection: Collection = JSON.parse(defaultData);
    const parsedDefault = parseCollection(defaultCollection, 'default.json');
    
    console.log('✅ Default Collection Parsed Successfully');
    console.log(`   - Name: ${parsedDefault.name}`);
    console.log(`   - Folders: ${parsedDefault.folders.length}`);
    console.log(`   - Top-level Requests: ${parsedDefault.requests.length}`);
    
    // Show folder structure
    console.log('📁 Default Collection Folder Structure:');
    parsedDefault.folders.forEach((folder, index) => {
      console.log(`   ${index + 1}. ${folder.name} (${folder.requests.length} requests)`);
      folder.requests.forEach((req, reqIndex) => {
        console.log(`      ${index + 1}.${reqIndex + 1}. ${req.method} ${req.name}`);
      });
    });
    console.log('');
    
  } catch (error) {
    console.error('❌ Error parsing default collection:', error);
  }
  
  // Test comprehensive collection (non-default)
  try {
    const comprehensiveData = fs.readFileSync(comprehensiveCollectionPath, 'utf8');
    const comprehensiveCollection: Collection = JSON.parse(comprehensiveData);
    const parsedComprehensive = parseCollection(comprehensiveCollection, 'Ecommerce_API.json');
    
    console.log('✅ E-commerce API Collection Parsed Successfully');
    console.log(`   - Name: ${parsedComprehensive.name}`);
    console.log(`   - Folders: ${parsedComprehensive.folders.length}`);
    console.log(`   - Top-level Requests: ${parsedComprehensive.requests.length}`);
    
    // Show folder structure with prefixes
    console.log('📁 E-commerce API Collection Folder Structure (with prefixes):');
    parsedComprehensive.folders.forEach((folder, index) => {
      console.log(`   ${index + 1}. ${folder.name} (${folder.requests.length} requests)`);
      folder.requests.forEach((req, reqIndex) => {
        console.log(`      ${index + 1}.${reqIndex + 1}. ${req.method} ${req.name}`);
      });
    });
    console.log('');
    
  } catch (error) {
    console.error('❌ Error parsing comprehensive collection:', error);
  }
  
  // Test sample collection
  try {
    const sampleData = fs.readFileSync(sampleCollectionPath, 'utf8');
    const sampleCollection: Collection = JSON.parse(sampleData);
    const parsedSample = parseCollection(sampleCollection, 'Sample_Collection.json');
    
    console.log('✅ Sample Collection Parsed Successfully');
    console.log(`   - Name: ${parsedSample.name}`);
    console.log(`   - Folders: ${parsedSample.folders.length}`);
    console.log(`   - Top-level Requests: ${parsedSample.requests.length}`);
    
    // Show folder structure
    console.log('📁 Sample Collection Folder Structure (with prefixes):');
    parsedSample.folders.forEach((folder, index) => {
      console.log(`   ${index + 1}. ${folder.name} (${folder.requests.length} requests)`);
    });
    
  } catch (error) {
    console.error('❌ Error parsing sample collection:', error);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testCollectionParsing();
}

export { testCollectionParsing };
