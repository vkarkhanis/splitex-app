#!/usr/bin/env node

// Merge duplicate users with same email but different entitlementSource
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert(require('./path-to-your-service-account-key.json'))
});

const db = admin.firestore();

async function findDuplicateUsers() {
  console.log('=== Finding duplicate users ===');
  
  // Get all users
  const usersSnapshot = await db.collection('users').get();
  const users = [];
  
  usersSnapshot.forEach(doc => {
    const data = doc.data();
    if (data.email) {
      users.push({
        id: doc.id,
        email: data.email.toLowerCase().trim(),
        displayName: data.displayName,
        tier: data.tier,
        entitlementSource: data.entitlementSource,
        entitlementStatus: data.entitlementStatus,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        capabilities: data.capabilities
      });
    }
  });
  
  // Find duplicates by email
  const emailGroups = {};
  users.forEach(user => {
    if (!emailGroups[user.email]) {
      emailGroups[user.email] = [];
    }
    emailGroups[user.email].push(user);
  });
  
  const duplicates = Object.entries(emailGroups).filter(([email, group]) => group.length > 1);
  
  console.log(`Found ${duplicates.length} emails with multiple users:`);
  
  for (const [email, group] of duplicates) {
    console.log(`\n--- Email: ${email} ---`);
    group.forEach(user => {
      console.log(`  ${user.id} - ${user.entitlementSource} - ${user.tier} - ${user.displayName}`);
    });
    
    // Find the RevenueCat user (should be the primary)
    const revenuecatUser = group.find(u => u.entitlementSource === 'revenuecat');
    const systemUser = group.find(u => u.entitlementSource === 'system');
    
    if (revenuecatUser && systemUser) {
      console.log(`  → RevenueCat user: ${revenuecatUser.id}`);
      console.log(`  → System user: ${systemUser.id}`);
      
      // Merge logic
      await mergeUsers(revenuecatUser, systemUser);
    }
  }
}

async function mergeUsers(primaryUser, secondaryUser) {
  console.log(`\n=== Merging users ===`);
  console.log(`Primary: ${primaryUser.id} (${primaryUser.entitlementSource})`);
  console.log(`Secondary: ${secondaryUser.id} (${secondaryUser.entitlementSource})`);
  
  const primaryRef = db.collection('users').doc(primaryUser.id);
  const secondaryRef = db.collection('users').doc(secondaryUser.id);
  
  // Keep the RevenueCat user as primary (has Pro status)
  // Merge data from system user if needed
  const mergedData = {
    ...primaryUser,
    // Keep system user data if revenuecat user is missing it
    displayName: primaryUser.displayName || secondaryUser.displayName,
    createdAt: secondaryUser.createdAt || primaryUser.createdAt, // Keep earliest
    updatedAt: new Date().toISOString(),
  };
  
  // Update primary user
  await primaryRef.set(mergedData, { merge: true });
  console.log(`✅ Updated primary user`);
  
  // Delete secondary user
  await secondaryRef.delete();
  console.log(`🗑️ Deleted secondary user`);
  
  console.log(`✅ Merge complete for ${primaryUser.email}`);
}

findDuplicateUsers().catch(console.error);
