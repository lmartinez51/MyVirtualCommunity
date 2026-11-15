using System;
using System.IO;
using System.Text;
using UnityEngine;

namespace MyVirtualCommunity.Character
{
    /// <summary>
    /// Phase A: Local persistence manager for player cosmetic avatar profiles.
    /// 
    /// GUARANTEES & INVARIANTS:
    /// 1. Stores cosmetic client data only in Application.persistentDataPath ("avatar_profile.json").
    /// 2. Zero World Core schema, backend API, or entity state mutations.
    /// 3. Transactional file replacement: On Windows NTFS, File.Replace invokes the Win32 ReplaceFile
    ///    API providing transactional replacement with an automatic backup file (.bak). On environments
    ///    without native replace support, a copy-with-backup fallback is used.
    /// 4. Startup Recovery Policy: If the primary profile is missing or corrupt, TryLoadProfile safely
    ///    attempts recovery from .bak, then from .tmp, restoring the valid profile.
    /// 5. Preservation: Malformed or invalid profile files are NEVER silently deleted.
    /// 6. Default Fallback: If no valid profile can be loaded or recovered, falls back safely to
    ///    BobbleheadConfig.CreatePlayerConfig() without touching disk.
    /// 7. Test Isolation: All methods accept an optional customFilePath parameter to ensure unit
    ///    and integration tests never read, write, or delete the live user profile.
    /// </summary>
    public static class BobbleheadProfileManager
    {
        public const string ProfileFileName = "avatar_profile.json";

        /// <summary>
        /// Default persistent file path for the active player's cosmetic profile.
        /// </summary>
        public static string DefaultProfilePath => Path.Combine(Application.persistentDataPath, ProfileFileName);

        /// <summary>
        /// Checks whether an avatar profile file exists at the specified or default path.
        /// </summary>
        public static bool ProfileExists(string customFilePath = null)
        {
            string path = customFilePath ?? DefaultProfilePath;
            return File.Exists(path);
        }

        /// <summary>
        /// Attempts to load and validate a saved cosmetic profile from disk.
        /// Implements a startup recovery policy:
        /// 1. Primary target file.
        /// 2. Recoverable backup (.bak) if primary is missing or corrupt.
        /// 3. Recoverable candidate (.tmp) if both primary and backup are unavailable.
        /// Malformed or corrupt files are preserved on disk and never silently deleted.
        /// </summary>
        public static bool TryLoadProfile(out BobbleheadCustomizationProfile profile, out string errorMessage, string customFilePath = null)
        {
            string targetPath = customFilePath ?? DefaultProfilePath;
            string backupPath = targetPath + ".bak";
            string tempPath = targetPath + ".tmp";

            // Attempt 1: Load primary target file
            if (File.Exists(targetPath))
            {
                if (TryReadAndValidateFile(targetPath, out profile, out string primaryErr))
                {
                    errorMessage = null;
                    return true;
                }

                Debug.LogWarning($"[BobbleheadProfileManager] Primary avatar profile at '{targetPath}' is invalid ({primaryErr}). Checking for recoverable backup...");
            }

            // Attempt 2: Recover from backup file (.bak)
            if (File.Exists(backupPath))
            {
                if (TryReadAndValidateFile(backupPath, out var backupProfile, out string backupErr))
                {
                    Debug.LogWarning($"[BobbleheadProfileManager] Successfully recovered valid avatar profile from backup '{backupPath}'. Restoring primary file.");
                    try
                    {
                        File.Copy(backupPath, targetPath, overwrite: true);
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning($"[BobbleheadProfileManager] Could not restore primary file from backup: {ex.Message}");
                    }

                    profile = backupProfile;
                    errorMessage = null;
                    return true;
                }
                else
                {
                    Debug.LogWarning($"[BobbleheadProfileManager] Backup file '{backupPath}' is also invalid ({backupErr}).");
                }
            }

            // Attempt 3: Recover from interrupted candidate temp file (.tmp)
            if (File.Exists(tempPath))
            {
                if (TryReadAndValidateFile(tempPath, out var tempProfile, out string tempErr))
                {
                    Debug.LogWarning($"[BobbleheadProfileManager] Successfully recovered valid avatar profile from candidate file '{tempPath}'. Installing to primary file.");
                    try
                    {
                        File.Copy(tempPath, targetPath, overwrite: true);
                        if (File.Exists(targetPath))
                        {
                            try { File.Delete(tempPath); } catch { /* ignore temp cleanup */ }
                        }
                    }
                    catch (Exception ex)
                    {
                        Debug.LogWarning($"[BobbleheadProfileManager] Could not install candidate file to primary: {ex.Message}");
                    }

                    profile = tempProfile;
                    errorMessage = null;
                    return true;
                }
            }

            // Profile exists but could not be loaded or recovered
            if (File.Exists(targetPath))
            {
                profile = null;
                errorMessage = "Profile file is corrupt or invalid and could not be recovered from backup";
                return false;
            }

            // Profile file does not exist
            profile = null;
            errorMessage = "Profile file not found";
            return false;
        }

        /// <summary>
        /// Reads a file from disk, parses it as BobbleheadCustomizationProfile, and runs complete validation.
        /// </summary>
        public static bool TryReadAndValidateFile(string path, out BobbleheadCustomizationProfile profile, out string errorMessage)
        {
            profile = null;
            if (!File.Exists(path))
            {
                errorMessage = "File does not exist";
                return false;
            }

            string jsonContent;
            try
            {
                jsonContent = File.ReadAllText(path, Encoding.UTF8);
            }
            catch (Exception ex)
            {
                errorMessage = $"I/O read error: {ex.Message}";
                return false;
            }

            if (string.IsNullOrWhiteSpace(jsonContent))
            {
                errorMessage = "File is empty";
                return false;
            }

            BobbleheadCustomizationProfile parsed;
            try
            {
                parsed = JsonUtility.FromJson<BobbleheadCustomizationProfile>(jsonContent);
            }
            catch (Exception ex)
            {
                errorMessage = $"Malformed JSON: {ex.Message}";
                return false;
            }

            if (parsed == null)
            {
                errorMessage = "Deserialization yielded null";
                return false;
            }

            // Schema v3 Migration: Detect valid schema version 1 or version 2 profile and migrate safely to version 3
            if (parsed.schemaVersion == 1)
            {
                if (parsed.MigrateFromV1(out string migErr))
                {
                    Debug.Log($"[BobbleheadProfileManager] Migrated avatar profile from Schema v1 to v3 for path '{path}'");
                }
                else
                {
                    errorMessage = $"Validation failed on v1 profile: {migErr}";
                    return false;
                }
            }
            else if (parsed.schemaVersion == 2)
            {
                if (parsed.MigrateFromV2(out string migV2Err))
                {
                    Debug.Log($"[BobbleheadProfileManager] Migrated avatar profile from Schema v2 to v3 for path '{path}'");
                }
                else
                {
                    errorMessage = $"Validation failed on v2 profile: {migV2Err}";
                    return false;
                }
            }

            if (!parsed.Validate(out string validationError))
            {
                errorMessage = $"Validation failed: {validationError}";
                return false;
            }

            profile = parsed;
            errorMessage = null;
            return true;
        }

        /// <summary>
        /// Saves an avatar profile using transactional replacement with backup:
        /// 1. Validates the profile before touching disk.
        /// 2. Serializes JSON to a temporary file (.tmp) in the same directory and ensures it is fully closed.
        /// 3. If destination exists, executes File.Replace with a backup file (.bak).
        /// 4. If destination does not exist, moves the temporary file to destination.
        /// 5. On failure, preserves the last known valid profile on disk.
        /// </summary>
        public static bool TrySaveProfile(BobbleheadCustomizationProfile profile, out string errorMessage, string customFilePath = null)
        {
            if (profile == null)
            {
                errorMessage = "Cannot save null profile";
                return false;
            }

            if (!profile.Validate(out string validationError))
            {
                errorMessage = $"Cannot save invalid profile: {validationError}";
                return false;
            }

            string targetPath = customFilePath ?? DefaultProfilePath;
            string tempPath = targetPath + ".tmp";
            string backupPath = targetPath + ".bak";

            string jsonString;
            try
            {
                jsonString = JsonUtility.ToJson(profile, true);
            }
            catch (Exception ex)
            {
                errorMessage = $"Failed to serialize profile to JSON: {ex.Message}";
                return false;
            }

            try
            {
                string directory = Path.GetDirectoryName(targetPath);
                if (!string.IsNullOrEmpty(directory) && !Directory.Exists(directory))
                {
                    Directory.CreateDirectory(directory);
                }

                // Step 1: Write candidate content to temporary file (File.WriteAllText guarantees stream is closed)
                File.WriteAllText(tempPath, jsonString, Encoding.UTF8);

                // Step 2: Install candidate file
                if (File.Exists(targetPath))
                {
                    try
                    {
                        File.Replace(tempPath, targetPath, backupPath, ignoreMetadataErrors: true);
                    }
                    catch (PlatformNotSupportedException)
                    {
                        // Fallback for runtimes without native replace support
                        File.Copy(targetPath, backupPath, overwrite: true);
                        File.Copy(tempPath, targetPath, overwrite: true);
                        if (File.Exists(tempPath)) File.Delete(tempPath);
                    }
                }
                else
                {
                    // Destination does not exist: same-directory atomic move
                    File.Move(tempPath, targetPath);
                }

                errorMessage = null;
                return true;
            }
            catch (Exception ex)
            {
                // Preserve last known valid profile on failure
                if (!File.Exists(targetPath) && File.Exists(backupPath))
                {
                    try { File.Copy(backupPath, targetPath, overwrite: true); } catch { /* ignore */ }
                }

                if (File.Exists(tempPath))
                {
                    try { File.Delete(tempPath); } catch { /* ignore temp cleanup */ }
                }

                errorMessage = $"Filesystem error saving avatar profile: {ex.Message}";
                return false;
            }
        }

        /// <summary>
        /// Obtains the effective BobbleheadConfig for the player avatar:
        /// - Loads and validates saved profile if available (using recovery policy if needed).
        /// - Falls back safely to BobbleheadConfig.CreatePlayerConfig() if missing or corrupt.
        /// - Never mutates disk during startup.
        /// </summary>
        public static BobbleheadConfig GetEffectivePlayerConfig(string customFilePath = null)
        {
            string targetPath = customFilePath ?? DefaultProfilePath;

            if (TryLoadProfile(out BobbleheadCustomizationProfile profile, out string errorMessage, targetPath))
            {
                Debug.Log($"[BobbleheadProfileManager] Loaded custom player avatar profile (Schema v{profile.schemaVersion})");
                return profile.ToConfig();
            }

            // If the file exists on disk but could not be loaded, log an actionable warning
            if (File.Exists(targetPath))
            {
                Debug.LogWarning($"[BobbleheadProfileManager] Could not load saved avatar profile ({errorMessage}). Falling back to default player configuration.");
            }
            else
            {
                Debug.Log("[BobbleheadProfileManager] No saved avatar profile found; using default player configuration.");
            }

            return BobbleheadConfig.CreatePlayerConfig();
        }

        /// <summary>
        /// Helper to save a BobbleheadConfig directly by converting to BobbleheadCustomizationProfile.
        /// Intended for future customization UI commit actions.
        /// </summary>
        public static bool TrySavePlayerConfig(BobbleheadConfig config, out string errorMessage, string customFilePath = null)
        {
            var profile = BobbleheadCustomizationProfile.FromConfig(config);
            return TrySaveProfile(profile, out errorMessage, customFilePath);
        }
    }
}
