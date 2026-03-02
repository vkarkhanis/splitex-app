#!/usr/bin/env node

// Check specific users in Firebase
const admin = require('firebase-admin');

// Initialize with your service account key
admin.initializeApp({
  credential: admin.credential.cert(require('./path-to-your-service-account-key.json'))
});

const db = admin.firestore();

async function checkSpecificUsers() {
  const usersToCheck = ['ola baker', 'kirsten marshall', 'Ola Baker', 'Kirsten Marshall'];
  
  for (const userName of usersToCheck) {
    console.log(`\n=== Checking: ${userName} ===`);
    
    // Query by display name
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('displayName', '==', userName).get();
    
    if (snapshot.empty) {
      console.log('Not found by display name');
      continue;
    }
    
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`User ID: ${doc.id}`);
      console.log(`Email: ${data.email || 'N/A'}`);
      console.log(`Tier: ${data.tier || 'free'}`);
      console.log(`Entitlement Source: ${data.entitlementSource || 'system'}`);
      console.log(`Created: ${data.createdAt || 'N/A'}`);
      console.log(`Last Updated: ${data.updatedAt || 'N/A'}`);
      console.log(`---`);
    });
  }
}

checkSpecificUsers().catch(console.error);
