import AsyncStorage from '@react-native-async-storage/async-storage';

const WALKTHROUGH_COMPLETED_KEY = '@traxettle_walkthrough_completed';

export async function hasCompletedWalkthrough(): Promise<boolean> {
  return (await AsyncStorage.getItem(WALKTHROUGH_COMPLETED_KEY)) === 'true';
}

export async function markWalkthroughCompleted(): Promise<void> {
  await AsyncStorage.setItem(WALKTHROUGH_COMPLETED_KEY, 'true');
}

export async function resetWalkthroughCompletion(): Promise<void> {
  await AsyncStorage.removeItem(WALKTHROUGH_COMPLETED_KEY);
}
