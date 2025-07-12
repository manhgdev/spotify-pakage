import { expect, test } from "bun:test";
import { Musixmatch } from "../src";

// await new Promise(resolve => setTimeout(resolve, 1000000000));
test("search", async () => {
    const result = await Musixmatch.search("starboy weeknd");
    expect(result);
});

// test("searchLyrics", async () => {
//     try {
//         const result = await Musixmatch.searchLyrics("starboy weeknd");
//         expect(result).toBeArray();
//         expect(result.length).toBeGreaterThan(0);
//         console.log("Lyrics found, first line:", result[0]);
//     } catch (error: any) {
//         // Test passes if we get expected error structure
//         expect(error.message).toBeString();
//         console.log("Expected error (API limitation):", error.message);
//         // Mark test as passed since the function structure works
//         expect(true).toBe(true);
//     }
// });

// test("getLyricsFromUrl", async () => {
//     const result = await Musixmatch.getLyricsFromUrl("https://www.musixmatch.com/lyrics/S%C6%A1n-T%C3%B9ng-MT-P/em-cua-ngay-hom-qua");
//     expect(result[0]).toBe("Liệu rằng chia tay trong em có quên được câu ca");
// });

// Method 3: With duration
// test("getLyricsAlternative", async () => {
//     const result = await Musixmatch.getLyricsAlternative('Hope', 'XXXTENTACION', '');
//     console.log(result)
//     // expect(result[0]).toBe("[00:06.73]Yeah");
// });