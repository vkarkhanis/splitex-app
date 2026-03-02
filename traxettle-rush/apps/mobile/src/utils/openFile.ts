import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as IntentLauncher from 'expo-intent-launcher';
import { getContentUriAsync } from 'expo-file-system/legacy';

/**
 * Opens a file in the user's chosen app (e.g. PDF viewer, spreadsheet app)
 * rather than showing a "share / send to" sheet.
 *
 * - **Android**: Uses IntentLauncher with ACTION_VIEW so the OS shows an
 *   "Open with…" picker.  The file URI is converted to a content:// URI
 *   via FileSystem.getContentUriAsync so other apps can read it.
 * - **iOS**: Uses Sharing.shareAsync which on iOS presents a share sheet
 *   that includes "Open in…" / "Save to Files" options by default.
 */
export async function openExportedFile(
  fileUri: string,
  mimeType: string,
  dialogTitle: string,
): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      // Convert file:// URI to content:// URI for Android
      const contentUri = await getContentUriAsync(fileUri);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        type: mimeType,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      });
    } catch (err: any) {
      console.warn('[openFile] IntentLauncher failed, falling back to Sharing:', err.message);
      // Fallback to sharing if IntentLauncher fails
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType, dialogTitle });
      }
    }
  } else {
    // iOS — Sharing.shareAsync shows "Open in…" / AirDrop / Save to Files
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType, dialogTitle });
    }
  }
}
