// Test xác thực mới với TOTP
import { Spotifly, Parse } from "./dist/index.js";

async function testAuthentication() {
  try {
    console.log("Khởi tạo Spotifly...");
    const sp = new Spotifly();
    
    // Thử tìm kiếm bài hát
    console.log("\nThử tìm kiếm bài hát 'Hãy trao cho anh'...");
    const search = await sp.searchTracks("Hãy trao cho anh", 1);
    console.log("Kết quả tìm kiếm:", search);
    
    if (search && search.data && search.data.searchV2 && search.data.searchV2.tracksV2) {
      const tracks = search.data.searchV2.tracksV2.items;
      if (tracks && tracks.length > 0) {
        console.log("\nĐã tìm thấy bài hát:");
        console.log("- Tên:", tracks[0].item.data.name);
        console.log("- Nghệ sĩ:", tracks[0].item.data.artists.items[0].profile.name);
      } else {
        console.log("Không tìm thấy bài hát");
      }
    }
    
    // Thử lấy thông tin một track cụ thể
    console.log("\nThử lấy thông tin bài hát 'Hãy trao cho anh'...");
    const trackId = "4vrjZ8cP9GUzSCFXWQGaeA"; // Hãy trao cho anh - Sơn Tùng MTP
    const track = await sp.getTrack(trackId);
    console.log("Thông tin bài hát:", track);
    
    if (track && track.data && track.data.trackUnion) {
      console.log("\nThông tin chi tiết:");
      console.log("- Tên:", track.data.trackUnion.name);
      console.log("- Album:", track.data.trackUnion.albumOfTrack.name);
      console.log("- Nghệ sĩ:", track.data.trackUnion.artistsWithRoles.items.map(i => i.artist.profile.name).join(", "));
    }
    
  } catch (error) {
    console.error("Lỗi:", error);
  }
}

testAuthentication(); 