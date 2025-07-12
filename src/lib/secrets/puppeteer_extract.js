/**
 * Spotify Canvas API Secret Extractor (Puppeteer-based implementation)
 * Trích xuất secret của Spotify Canvas API bằng cách sử dụng puppeteer để tự động hóa trình duyệt
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

// Sử dụng StealthPlugin để tránh phát hiện bot
puppeteer.use(StealthPlugin());

// Các biến cấu hình
const SPOTIFY_URL = 'https://open.spotify.com';
const TIMEOUT = 60000; // Giảm timeout xuống 60 giây
const BUNDLE_RE = /(?:vendor~web-player|encore~web-player|web-player)\.[0-9a-f]{4,}\.(?:js|mjs)/;

/**
 * Hàm đợi với promise
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Lưu và định dạng các secret đã trích xuất
 */
function summarise(caps) {
  const real = {};

  for (const cap of caps) {
    const sec = cap.secret;
    if (typeof sec !== "string" || sec === 'string') {
      continue;
    }

    const ver =
      cap.version ||
      (typeof cap.obj === "object" && cap.obj !== null && cap.obj.version) ||
      1;

    if (ver == null) {
      continue;
    }

    real[String(ver)] = sec;
  }

  if (Object.keys(real).length === 0) {
    console.log("Không tìm thấy secret hợp lệ.");
    return;
  }

  const sortedEntries = Object.entries(real).sort(
    (a, b) => parseInt(a[0]) - parseInt(b[0]),
  );

  const formattedData = sortedEntries.map(([version, secret]) => ({
    version: parseInt(version),
    secret,
  }));

  const secretBytes = formattedData.map(({ version, secret }) => ({
    version,
    secret: Array.from(secret).map((c) => c.charCodeAt(0)),
  }));

  // Tạo thư mục secrets nếu chưa tồn tại (cùng cấp với file hiện tại)
  const secretsDir = path.dirname(new URL(import.meta.url).pathname);

  // Lưu dữ liệu vào file
  fs.writeFileSync(
    path.join(secretsDir, 'secrets.json'),
    JSON.stringify(formattedData, null, 2)
  );

  fs.writeFileSync(
    path.join(secretsDir, 'secretBytes.json'),
    JSON.stringify(secretBytes, null, 2)
  );

  console.log("Các secret đã trích xuất:");
  console.log(formattedData);
}

/**
 * Trích xuất Canvas API secret từ Spotify Web Player
 */
async function grabLive() {
  // Hook để chặn và lấy secret từ các đối tượng JavaScript
  const hook = `(()=>{
    if(globalThis.__secretHookInstalled) return;
    globalThis.__secretHookInstalled = true;
    globalThis.__captures = [];
    
    Object.defineProperty(Object.prototype, 'secret', {
      configurable: true,
      set: function(v) {
        try {
          __captures.push({
            secret: v,
            version: this.version,
            obj: this
          });
        } catch(e) {}
        
        Object.defineProperty(this, 'secret', {
          value: v,
          writable: true,
          configurable: true,
          enumerable: true
        });
      }
    });
    
    // Thêm hook cho canvasApiSecret
    Object.defineProperty(Object.prototype, 'canvasApiSecret', {
      configurable: true,
      set: function(v) {
        try {
          __captures.push({
            secret: v,
            version: this.canvasApiVersion || this.version,
            obj: this
          });
        } catch(e) {}
        
        Object.defineProperty(this, 'canvasApiSecret', {
          value: v,
          writable: true,
          configurable: true,
          enumerable: true
        });
      }
    });

    // Thêm hook cho các thuộc tính khác có thể chứa secret
    const possibleSecretProps = ['canvasSecret', 'apiSecret', 'canvas'];
    possibleSecretProps.forEach(prop => {
      Object.defineProperty(Object.prototype, prop, {
        configurable: true,
        set: function(v) {
          try {
            if (typeof v === 'string' && v.length > 8) {
              __captures.push({
                secret: v,
                version: this.version || 1,
                obj: this,
                property: prop
              });
            }
          } catch(e) {}
          
          Object.defineProperty(this, prop, {
            value: v,
            writable: true,
            configurable: true,
            enumerable: true
          });
        }
      });
    });
  })();`;

  console.log("Khởi chạy trình duyệt...");
  const browser = await puppeteer.launch({
    headless: "new", // Sử dụng headless mới
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-web-security",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process"
    ]
  });

  try {
    const page = await browser.newPage();

    // Thiết lập timeout cho trang
    await page.setDefaultNavigationTimeout(TIMEOUT);
    await page.setDefaultTimeout(TIMEOUT);

    // Thiết lập User-Agent để giả lập trình duyệt thực
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Tối ưu hóa performance
    await page.setCacheEnabled(false);
    await page.setRequestInterception(true);

    // Chặn các request không cần thiết để tăng tốc
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Chèn hook JavaScript vào trang
    await page.evaluateOnNewDocument(hook);

    // Theo dõi các bundle JavaScript được tải
    page.on("response", (response) => {
      const url = response.url();
      const filename = url.split("/").pop() || "";
      if (BUNDLE_RE.test(filename)) {
        console.log(`Tải bundle: ${filename}: ${response.status()}`);
      }
    });

    console.log("Mở Spotify Web Player...");

    // Thay đổi cách tải trang
    try {
      await page.goto(SPOTIFY_URL, {
        waitUntil: "domcontentloaded", // Chỉ đợi đến khi DOM được tải
        timeout: TIMEOUT,
      });

      console.log("Trang đã tải xong DOM, đợi thêm để JavaScript thực thi...");

      // Đợi cho phần tử cụ thể xuất hiện
      try {
        await page.waitForSelector('div[data-testid="root"]', { timeout: 15000 });
        console.log("Đã tìm thấy phần tử root");
      } catch (err) {
        console.log("Không tìm thấy phần tử root, nhưng vẫn tiếp tục...");
      }

    } catch (err) {
      console.log("Lỗi khi tải trang, nhưng vẫn tiếp tục:", err.message);
    }

    // Đợi thêm để đảm bảo JavaScript được tải và thực thi
    console.log("Đợi JavaScript được thực thi...");
    await sleep(5000); // Giảm thời gian chờ xuống 5 giây

    // Thử tương tác với trang để kích hoạt thêm JavaScript
    try {
      await page.click('body');
      await page.keyboard.press('Escape');
      console.log("Đã tương tác với trang");
    } catch (err) {
      console.log("Không thể tương tác với trang:", err.message);
    }

    // Đợi thêm sau khi tương tác
    await sleep(3000); // Giảm thời gian chờ xuống 3 giây

    // Lấy các secret đã bị hook
    const caps = await page.evaluate(() => {
      return globalThis.__captures || [];
    });

    if (caps.length > 0) {
      console.log(`Đã tìm thấy ${caps.length} secret:`);
      for (const c of caps) {
        if (typeof c.secret === "string" && c.secret !== 'string') {
          const version = c.version || 1;
          const property = c.property || 'secret';
          console.log(`${property}(${version}): ${c.secret}`);
        }
      }
    } else {
      console.log("Không tìm thấy secret nào.");

      // Thử tìm kiếm trong mã nguồn của trang
      console.log("Tìm kiếm trong mã nguồn của trang...");
      const content = await page.content();

      // Tìm các pattern có thể là secret
      const secretPatterns = [
        /secret["'\s:=]+["']([^"']{15,})["']/g,
        /canvasApiSecret["'\s:=]+["']([^"']{15,})["']/g,
        /canvas\.secret["'\s:=]+["']([^"']{15,})["']/g
      ];

      const foundSecrets = [];
      for (const pattern of secretPatterns) {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          if (match[1] && match[1] !== 'string') {
            foundSecrets.push({
              secret: match[1],
              version: 1
            });
          }
        }
      }

      if (foundSecrets.length > 0) {
        console.log(`Tìm thấy ${foundSecrets.length} secret trong mã nguồn:`);
        for (const s of foundSecrets) {
          console.log(`Secret: ${s.secret}`);
        }
        return foundSecrets;
      }
    }

    return caps;
  } finally {
    await browser.close();
  }
}

/**
 * Hàm chính
 */
export async function puppeteer_extract() {
  try {
    console.log("Bắt đầu trích xuất Spotify Canvas API secret...");
    const caps = await grabLive();
    summarise(caps);
  } catch (error) {
    console.error("Lỗi:", error);
  }
}

// Chạy hàm chính
// puppeteer_extract(); 