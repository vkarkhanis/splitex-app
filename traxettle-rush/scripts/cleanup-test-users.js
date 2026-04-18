#!/usr/bin/env node

// Clean up obvious test users from staging
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert(require('./path-to-your-service-account-key.json'))
});

const db = admin.firestore();

async function cleanupTestUsers() {
  const testUserPatterns = [
    'ola baker',
    'kirsten marshall', 
    'test',
    'demo',
    'sandbox'
  ];
  
  console.log('=== Cleaning up test users ===');
  
  for (const pattern of testUserPatterns) {
    // Check display names
    const displayNameSnapshot = await db.collection('users')
      .where('displayName', '>=', pattern)
      .where('displayName', '<=', pattern + '\uf8ff')
      .get();
    
    // Check emails
    const emailSnapshot = await db.collection('users')
      .where('email', '>=', pattern)
      .where('email', '<=', pattern + '\uf8ff')
      .get();
    
    // Combine results
    const allDocs = [...displayNameSnapshot.docs, ...emailSnapshot.docs];
    const uniqueDocs = allDocs.filter((doc, index, arr) => 
      arr.findIndex(d => d.id === doc.id) === index
    );
    
    console.log(`\nPattern: "${pattern}" - Found ${uniqueDocs.length} users`);
    
    for (const doc of uniqueDocs) {
      const data = doc.data();
      console.log(`- ${data.displayName || data.email} (${doc.id})`);
      
      // Only delete if clearly test data
      if (data.email?.includes('test') || 
          data.email?.includes('sandbox') ||
          data.displayName?.toLowerCase().includes('test')) {
        console.log(`  → Deleting (clear test user)`);
        await doc.ref.delete();
      } else {
        console.log(`  → Keeping (might be real user)`);
      }
    }
  }
  
  console.log('\n=== Cleanup complete ===');
}

cleanupTestUsers().catch(console.error);
