using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

namespace MyVirtualCommunity.Editor
{
    public static class MyVirtualCommunityBuild
    {
        private const string ScenePath = "Assets/Scenes/GomezMorinSlice.unity";

        [MenuItem("Build/Build Windows x64")]
        public static void BuildWindows64()
        {
            Debug.Log("[Build] Starting MyVirtualCommunity Windows x64 Build...");
            EnsureRequiredShadersIncluded();

            string outputDirectory = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "Builds", "Windows"));
            string outputPath = Path.Combine(outputDirectory, "MyVirtualCommunity.exe");

            if (!Directory.Exists(outputDirectory))
            {
                Directory.CreateDirectory(outputDirectory);
                Debug.Log($"[Build] Created output directory: {outputDirectory}");
            }

            if (!File.Exists(ScenePath))
            {
                Debug.LogError($"[Build] Target scene does not exist: {ScenePath}");
                if (Application.isBatchMode)
                {
                    EditorApplication.Exit(1);
                }
                return;
            }

            // Ensure the scene is registered in EditorBuildSettings
            EditorBuildSettingsScene[] scenes = new EditorBuildSettingsScene[]
            {
                new EditorBuildSettingsScene(ScenePath, true)
            };
            EditorBuildSettings.scenes = scenes;

            BuildPlayerOptions buildPlayerOptions = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = outputPath,
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.None
            };

            Debug.Log($"[Build] Building player to: {outputPath}");
            BuildReport report = BuildPipeline.BuildPlayer(buildPlayerOptions);
            BuildSummary summary = report.summary;

            if (summary.result == BuildResult.Succeeded)
            {
                DeployTexturesToBuild(outputDirectory);
                Debug.Log($"[Build] Build succeeded! Total size: {summary.totalSize} bytes, Total time: {summary.totalTime.TotalSeconds:F1}s");
                if (Application.isBatchMode)
                {
                    EditorApplication.Exit(0);
                }
            }
            else
            {
                Debug.LogError($"[Build] Build failed with result: {summary.result}. Total errors: {summary.totalErrors}");
                if (Application.isBatchMode)
                {
                    EditorApplication.Exit(1);
                }
            }
        }

        private static void EnsureRequiredShadersIncluded()
        {
            var shader = Shader.Find("Custom/3DTextDepthTested");
            if (shader == null)
            {
                Debug.LogWarning("[Build] Custom/3DTextDepthTested shader not found during pre-build check!");
                return;
            }

            var graphicsSettingsAsset = AssetDatabase.LoadAssetAtPath<UnityEngine.Rendering.GraphicsSettings>("ProjectSettings/GraphicsSettings.asset");
            if (graphicsSettingsAsset == null) return;

            var serializedObj = new SerializedObject(graphicsSettingsAsset);
            var alwaysIncludedProp = serializedObj.FindProperty("m_AlwaysIncludedShaders");
            if (alwaysIncludedProp != null)
            {
                bool exists = false;
                for (int i = 0; i < alwaysIncludedProp.arraySize; i++)
                {
                    if (alwaysIncludedProp.GetArrayElementAtIndex(i).objectReferenceValue == shader)
                    {
                        exists = true;
                        break;
                    }
                }

                if (!exists)
                {
                    alwaysIncludedProp.InsertArrayElementAtIndex(alwaysIncludedProp.arraySize);
                    alwaysIncludedProp.GetArrayElementAtIndex(alwaysIncludedProp.arraySize - 1).objectReferenceValue = shader;
                    serializedObj.ApplyModifiedProperties();
                    AssetDatabase.SaveAssets();
                    Debug.Log("[Build] Registered Custom/3DTextDepthTested in GraphicsSettings.m_AlwaysIncludedShaders.");
                }
            }
        }

        private static void DeployTexturesToBuild(string outputDirectory)
        {
            string srcTextures = Path.Combine(Application.dataPath, "Textures");
            if (!Directory.Exists(srcTextures)) return;

            string destDataTextures = Path.Combine(outputDirectory, "MyVirtualCommunity_Data", "Textures");
            string destRootTextures = Path.Combine(outputDirectory, "Textures");

            if (!Directory.Exists(destDataTextures)) Directory.CreateDirectory(destDataTextures);
            if (!Directory.Exists(destRootTextures)) Directory.CreateDirectory(destRootTextures);

            foreach (string file in Directory.GetFiles(srcTextures))
            {
                if (file.EndsWith(".meta", StringComparison.OrdinalIgnoreCase)) continue;
                string fileName = Path.GetFileName(file);
                File.Copy(file, Path.Combine(destDataTextures, fileName), true);
                File.Copy(file, Path.Combine(destRootTextures, fileName), true);
                Debug.Log($"[Build] Deployed texture asset '{fileName}' to standalone build directory.");
            }
        }
    }
}
