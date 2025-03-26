// Test xác thực mới với TOTP - lấy ID từ kết quả tìm kiếm
import { Spotifly, Parse } from "./dist/index.js";

async function testAuthentication() {
  try {
    console.log("Khởi tạo Spotifly...");
    const sp = new Spotifly();
    
    // Thử tìm kiếm bài hát
    console.log("\nThử tìm kiếm bài hát 'Hãy trao cho anh'...");
    const search = await sp.searchTracks("Hãy trao cho anh", 1);
    
    if (search && search.data && search.data.searchV2 && search.data.searchV2.tracksV2) {
      const tracks = search.data.searchV2.tracksV2.items;
      if (tracks && tracks.length > 0) {
        console.log("\nĐã tìm thấy bài hát:");
        console.log("- Tên:", tracks[0].item.data.name);
        console.log("- Nghệ sĩ:", tracks[0].item.data.artists.items[0].profile.name);
        
        // Lấy ID từ kết quả tìm kiếm
        const trackUri = tracks[0].item.data.uri;
        const trackId = Parse.uriToId(trackUri);
        console.log("- Track ID:", trackId);
        console.log("- Track URI:", trackUri);
        
        // Sử dụng ID đó để lấy thông tin chi tiết
        console.log("\nThử lấy thông tin bài hát với ID lấy từ kết quả tìm kiếm...");
        const track = await sp.getTrack(trackId);
        
        if (track && track.data && track.data.trackUnion) {
          if (track.data.trackUnion.__typename === 'NotFound') {
            console.log("Không tìm thấy bài hát với ID:", trackId);
            console.log(track.data.trackUnion);
          } else {
            console.log("\nThông tin chi tiết:");
            console.log("- Tên:", track.data.trackUnion.name);
            console.log("- Album:", track.data.trackUnion.albumOfTrack.name);
            console.log("- Nghệ sĩ:", track.data.trackUnion.artistsWithRoles.items.map(i => i.artist.profile.name).join(", "));
          }
        } else {
          console.log("Không thể lấy thông tin chi tiết bài hát");
        }
      } else {
        console.log("Không tìm thấy bài hát");
      }
    }
    
    // Thử tìm kiếm album
    console.log("\nThử tìm kiếm album...");
    const albumSearch = await sp.searchAlbums("sky tour", 1);
    console.log("Kết quả tìm kiếm album:", albumSearch);
    
  } catch (error) {
    console.error("Lỗi:", error);
  }
}

testAuthentication(); 