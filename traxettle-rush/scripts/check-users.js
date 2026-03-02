#!/usr/bin/env node

// Quick script to check user details in Firebase
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, getDocs, doc, getDoc } = require('firebase/firestore');

// Firebase config for staging
const firebaseConfig = {
  // You'll need to get this from your Firebase Console
  // Or use the service account key
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkUsers() {
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);
  
  console.log('=== All Users in Staging ===');
  snapshot.forEach(doc => {
    const data = doc.data();
    console.log(`\nUser: ${doc.id}`);
    console.log(`Email: ${data.email || 'N/A'}`);
    console.log(`Display Name: ${data.displayName || 'N/A'}`);
    console.log(`Tier: ${data.tier || 'free'}`);
    console.log(`Entitlement Status: ${data.entitlementStatus || 'active'}`);
    console.log(`Entitlement Source: ${data.entitlementSource || 'system'}`);
    console.log(`Created At: ${data.createdAt || 'N/A'}`);
    console.log(`Updated At: ${data.updatedAt || 'N/A'}`);
    console.log(`Internal Tester: ${data.internalTester || false}`);
    
    if (data.capabilities) {
      console.log(`Capabilities: ${JSON.stringify(data.capabilities)}`);
    }
  });
}

checkUsers().catch(console.error);
