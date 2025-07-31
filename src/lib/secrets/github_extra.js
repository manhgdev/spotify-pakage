import fs from 'fs';
import path from 'path';

export async function github_extra() {
    try {
        const response = await fetch('https://raw.githubusercontent.com/Thereallo1026/spotify-secrets/refs/heads/main/secrets/secretBytes.json');
        const data = await response.json();
        // save to file

        // Tạo thư mục secrets nếu chưa tồn tại (cùng cấp với file hiện tại)
        const secretsDir = path.dirname(new URL(import.meta.url).pathname);

        fs.writeFileSync(
            path.join(secretsDir, 'secretBytes.json'),
            JSON.stringify(data, null, 2)
        );
        return true;
    } catch (error) {
        console.error('Lỗi khi lấy secret từ github:', error);
        return false;
    }
}