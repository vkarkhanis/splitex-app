# Developer Options Testing Guide - Real Devices

## 🎯 Testing the 7-Tap Trigger on Real Devices

The 7-tap trigger is designed specifically for real devices. Here's how to test it effectively:

## 📱 Real Device Testing

### **Step 1: Install the App**
```bash
# Build and install on real device
rushx build:android
# Install the .apk on your device
```

### **Step 2: Locate the Trigger**
The trigger is wrapped around:
- **Version text** in profile/settings screens
- **App footer** in some screens
- **Logo or branding** elements

### **Step 3: Perform the 7-Tap Sequence**
```
1. Find the version text (e.g., "Version 1.0.0")
2. Tap it 7 times quickly (within 2 seconds)
3. Developer options modal should appear
```

### **Step 4: Test Environment Switching**
```
1. In developer options, toggle "Switch to Staging"
2. "STAGE" badge should appear in profile
3. App now uses staging API/Firebase
4. Switch back to production to verify
```

## 🔍 Debugging Tips

### **Console Logging**
Enable console logging to see tap counting:
```javascript
// Look for these logs in your debugging tool:
[DevOptions] Tap 1, time since last: 0ms
[DevOptions] Tap count increased to 2
[DevOptions] Tap 3, time since last: 300ms
...
[DevOptions] 7 taps detected! Showing developer options
```

### **Common Issues & Solutions**

#### **Issue: Taps Not Registering**
**Cause**: Touch events not properly captured
**Solution**: 
- Ensure you're tapping the exact version text
- Try tapping more firmly
- Check if the component is properly wrapped

#### **Issue: Tap Count Resets**
**Cause**: Taps too slow (more than 2 seconds apart)
**Solution**: 
- Tap faster (within 2 seconds)
- Practice the rhythm: tap-tap-tap-tap-tap-tap-tap

#### **Issue: Modal Doesn't Appear**
**Cause**: Component not properly mounted
**Solution**: 
- Check console for errors
- Verify the DeveloperOptionsTrigger component is used
- Try restarting the app

#### **Issue: Staging Mode Doesn't Work**
**Cause**: Runtime config not loading
**Solution**: 
- Check internet connection
- Verify staging API is accessible
- Check console for API errors

## 🧪 Testing Scenarios

### **Scenario 1: Basic Functionality**
```
1. Install app on real device
2. Tap version text 7 times quickly
3. Verify developer options modal appears
4. Close modal and repeat to ensure consistency
```

### **Scenario 2: Environment Switching**
```
1. Enable developer options
2. Switch to staging mode
3. Verify "STAGE" badge appears
4. Test app functionality with staging
5. Switch back to production
6. Verify badge disappears
```

### **Scenario 3: Persistence**
```
1. Switch to staging mode
2. Force close and reopen app
3. Verify staging mode is still active
4. Switch back to production
5. Force close and reopen app
6. Verify production mode is restored
```

### **Scenario 4: Error Handling**
```
1. Try using app without developer options
2. Verify production API error appears
3. Follow instructions to enable developer options
4. Verify error message is helpful
```

## 📊 Expected Behavior

### **Visual Indicators**
- **Production Mode**: No badge, normal appearance
- **Staging Mode**: Orange "STAGE" badge in profile
- **Developer Options**: Modal with environment toggle

### **Console Logs**
```
[RuntimeConfig] Fetching config from: https://prod-api... (production mode)
[RuntimeConfig] Fetching config from: https://staging-api... (staging mode)
[DevOptions] Tap counting logs
[Firebase] Services initialized with environment info
```

### **API Behavior**
- **Production**: Uses production Firebase project
- **Staging**: Uses staging Firebase project
- **Error**: Shows helpful message when production unavailable

## 🛠️ Development Tools

### **For React Native**
```bash
# Enable debug logging
npx react-native log-android
# or
npx react-native log-ios
```

### **For Expo**
```bash
# View logs
npx expo start --dev-client
# Check Metro logs
```

### **For Flipper**
```bash
# Use Flipper to inspect React Native logs
# Look for [DevOptions] and [RuntimeConfig] logs
```

## 🎯 Success Criteria

### **Must Work**
✅ 7-tap trigger activates developer options  
✅ Environment switching works correctly  
✅ Visual indicators appear/disappear properly  
✅ Settings persist across app restarts  
✅ Error handling works as expected  

### **Should Work**
✅ Console logging provides useful debug info  
✅ Modal appears and dismisses correctly  
✅ API URLs switch between environments  
✅ Firebase projects switch correctly  

## 🚨 Troubleshooting Checklist

### **Before Testing**
- [ ] App built with production configuration
- [ ] Device has internet connection
- [ ] Staging API is accessible
- [ ] Console logging is enabled

### **During Testing**
- [ ] Taps register in console logs
- [ ] Modal appears after 7 taps
- [ ] Environment switching works
- [ ] Visual indicators update correctly

### **After Testing**
- [ ] Settings persist correctly
- [ ] App works in both environments
- [ ] No console errors
- [ ] User experience is smooth

## 📱 Real Device vs Emulator

| Feature | Real Device | Emulator |
|---------|-------------|----------|
| 7-Tap Trigger | ✅ Works | ❌ May not work |
| Long Press | ✅ Works | ✅ Works (debug) |
| Touch Events | ✅ Native | ❌ Simulated |
| User Experience | ✅ Realistic | ⚠️ Limited |

## 🎉 Ready for Testing

With these guidelines, you can effectively test the developer options functionality on real devices:

1. **Install the app** on a real device
2. **Practice the 7-tap sequence** 
3. **Verify all functionality** works as expected
4. **Test edge cases** and error scenarios
5. **Document any issues** for improvement

The 7-tap trigger is designed to be **hidden from regular users** but **accessible to developers and testers** when needed!
