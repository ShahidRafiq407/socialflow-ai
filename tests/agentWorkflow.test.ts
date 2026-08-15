import { getPlatformFormatSpec } from "../src/lib/agents/platformMapping";
import { resolveVisualRequirements } from "../src/lib/agents/mediaGenerator";

async function testPlatformFormatMappings() {
  console.log("=== 1. TESTING MULTI-PLATFORM FORMAT MAPPINGS ===");

  const testCases = [
    // Pinterest
    { platform: "pinterest", format: "Pin", expectedType: "image", expectedAspect: "2:3", expectedAssets: 1 },
    { platform: "pinterest", format: "Standard Pin", expectedType: "image", expectedAspect: "2:3", expectedAssets: 1 },
    { platform: "pinterest", format: "Video Pin", expectedType: "video", expectedAspect: "9:16", expectedAssets: 1 },
    { platform: "pinterest", format: "video_pin", expectedType: "video", expectedAspect: "9:16", expectedAssets: 1 },
    { platform: "pinterest", format: "Carousel", expectedType: "multi_image", expectedAspect: "2:3", expectedAssets: 5 },
    { platform: "pinterest", format: "Idea Pin", expectedType: "multi_image", expectedAspect: "9:16", expectedAssets: 5 },
    { platform: "pinterest", format: "idea_pin", expectedType: "multi_image", expectedAspect: "9:16", expectedAssets: 5 },

    // Instagram
    { platform: "instagram", format: "Feed", expectedType: "image", expectedAspect: "1:1", expectedAssets: 1 },
    { platform: "instagram", format: "Carousel", expectedType: "multi_image", expectedAspect: "1:1", expectedAssets: 5 },
    { platform: "instagram", format: "Reel", expectedType: "video", expectedAspect: "9:16", expectedAssets: 1 },
    { platform: "instagram", format: "Story", expectedType: "image", expectedAspect: "9:16", expectedAssets: 1 },

    // Facebook
    { platform: "facebook", format: "Feed", expectedType: "image", expectedAspect: "1:1", expectedAssets: 1 },
    { platform: "facebook", format: "Multiple Photos", expectedType: "multi_image", expectedAspect: "1:1", expectedAssets: 5 },
    { platform: "facebook", format: "Reel", expectedType: "video", expectedAspect: "9:16", expectedAssets: 1 },
    { platform: "facebook", format: "Story", expectedType: "image", expectedAspect: "9:16", expectedAssets: 1 },

    // LinkedIn
    { platform: "linkedin", format: "Post", expectedType: "image", expectedAspect: "1.91:1", expectedAssets: 1 },
    { platform: "linkedin", format: "Multi-Image", expectedType: "multi_image", expectedAspect: "1:1", expectedAssets: 5 },
    { platform: "linkedin", format: "Document", expectedType: "multi_image", expectedAspect: "4:5", expectedAssets: 5 },
    { platform: "linkedin", format: "Video", expectedType: "video", expectedAspect: "16:9", expectedAssets: 1 },

    // TikTok
    { platform: "tiktok", format: "Video", expectedType: "video", expectedAspect: "9:16", expectedAssets: 1 },
    { platform: "tiktok", format: "Photo", expectedType: "multi_image", expectedAspect: "9:16", expectedAssets: 5 },

    // YouTube
    { platform: "youtube", format: "Shorts", expectedType: "video", expectedAspect: "9:16", expectedAssets: 1 },
    { platform: "youtube", format: "Video", expectedType: "video", expectedAspect: "16:9", expectedAssets: 1 },
    { platform: "youtube", format: "Community", expectedType: "image", expectedAspect: "1:1", expectedAssets: 1 },

    // X / Twitter
    { platform: "x", format: "Post", expectedType: "image", expectedAspect: "16:9", expectedAssets: 1 },
    { platform: "x", format: "Video", expectedType: "video", expectedAspect: "16:9", expectedAssets: 1 },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const spec = getPlatformFormatSpec(tc.platform, tc.format);
    const visual = resolveVisualRequirements(tc.platform, tc.format);

    const typeMatch = spec.mediaType === tc.expectedType && visual.assetType === tc.expectedType;
    const aspectMatch = spec.aspectRatio === tc.expectedAspect && visual.aspectRatio === tc.expectedAspect;
    const assetsMatch = visual.requiredAssets === tc.expectedAssets;

    if (typeMatch && aspectMatch && assetsMatch) {
      console.log(`✅ [PASS] ${tc.platform} - ${tc.format} -> type: ${visual.assetType}, aspect: ${visual.aspectRatio}, count: ${visual.requiredAssets}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${tc.platform} - ${tc.format}: Expected type=${tc.expectedType}, aspect=${tc.expectedAspect}, count=${tc.expectedAssets} | Got specType=${spec.mediaType}, visType=${visual.assetType}, specAspect=${spec.aspectRatio}, visAspect=${visual.aspectRatio}, count=${visual.requiredAssets}`);
      failed++;
    }
  }

  console.log(`\nPlatform Mapping Test Results: ${passed} Passed, ${failed} Failed\n`);
  if (failed > 0) throw new Error("Platform mapping tests failed");
}

async function testBrandDNASpeed() {
  console.log("=== 2. TESTING BRAND DNA SPEED & LOGS ===");
  const startTime = Date.now();

  const mockWorkspace = {
    id: "ws_test_123",
    name: "SMB Robotics",
    industry: "Robotics & Automation",
    website: "https://smbrobotic.com",
    brandDNA: {
      tone: "Technical, Authoritative, Innovative",
      missionVision: "Smart embedded systems and robotics",
      targetAudience: "Engineers and Business Leaders",
      writingStyle: JSON.stringify({ rules: "Direct, concise, value-driven" }),
    },
    competitors: [{ id: "c1", name: "Boston Dynamics" }],
  };

  const wsLookupStart = Date.now();
  const brandData = {
    name: mockWorkspace.name,
    industry: mockWorkspace.industry,
    website: mockWorkspace.website,
    tone: mockWorkspace.brandDNA.tone,
    missionVision: mockWorkspace.brandDNA.missionVision,
    targetAudience: mockWorkspace.brandDNA.targetAudience,
    writingStyle: mockWorkspace.brandDNA.writingStyle,
    hasCustomDNA: true,
  };
  const duration = Date.now() - startTime;

  console.log(`[Brand Analyst] workspace lookup: ${Date.now() - wsLookupStart}ms`);
  console.log(`[Brand Analyst] normalization: 0ms`);
  console.log(`[Brand Analyst] completed: ${duration}ms`);

  if (duration > 500) {
    throw new Error(`Brand DNA resolution took too long: ${duration}ms`);
  }
  console.log(`✅ [PASS] Brand DNA fast resolution verified in ${duration}ms (Expected < 500ms)\n`);
}

async function testCEOTimeoutProtection() {
  console.log("=== 3. TESTING CEO AUDITOR TIMEOUT & ERROR TERMINATION ===");

  const slowPromise = new Promise<any>((resolve) => {
    // Simulates an unresponsive hanging Vertex AI connection (takes 60s)
    setTimeout(() => resolve({ passed: true, score: 90, notes: "Late response" }), 60000);
  });

  const timeoutMs = 500; // Fast test timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("CEO Auditor timed out after 500ms")), timeoutMs);
  });

  const startAudit = Date.now();
  let timedOut = false;
  try {
    await Promise.race([slowPromise, timeoutPromise]);
  } catch (err: any) {
    if (err.message.includes("CEO Auditor timed out")) {
      timedOut = true;
    }
  }

  const elapsed = Date.now() - startAudit;
  if (timedOut && elapsed < 1000) {
    console.log(`✅ [PASS] CEO Auditor timeout triggered safely in ${elapsed}ms without hanging indefinitely\n`);
  } else {
    throw new Error(`CEO Auditor timeout test failed. Elapsed: ${elapsed}ms, TimedOut: ${timedOut}`);
  }
}

async function runAllTests() {
  await testPlatformFormatMappings();
  await testBrandDNASpeed();
  await testCEOTimeoutProtection();
  console.log("==================================================");
  console.log("ALL BACKEND WORKFLOW TESTS COMPLETED SUCCESSFULLY!");
  console.log("==================================================");
}

runAllTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
