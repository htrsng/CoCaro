# Encircle (Bao Vây) - CoCaro

Encircle là game chiến thuật 2 người chơi theo phòng (real-time), lấy cảm hứng từ cờ vây và cơ chế bao vây bắt quân.

Dự án hiện tại tập trung vào multiplayer qua Socket.IO với luật chơi riêng:

- Chọn vai `X`/`O` trong cùng một phòng.
- Đánh theo lượt, có cơ chế `combo` (bắt quân sẽ được thêm lượt ngay lập tức).
- Có `Pass`, `Đầu hàng`, kết thúc trận khi 2 bên cùng pass hoặc bàn cờ đầy.
- Điểm được tính theo quân còn sống + số quân đã bắt.

## Tính năng chính

- Multiplayer theo phòng với URL hash (`/#<roomId>`).
- Khóa vai cho từng người chơi, hỗ trợ spectator.
- Kích thước bàn cờ: `9x9`, `13x13`, `19x19`, `25x25`.
- Lưu trạng thái trận theo phòng trên server (in-memory).
- Lịch sử kết quả trong phiên trên client (mất khi reload/đổi tab/đổi session).
- Tạo link mời bạn tự động theo LAN/public URL (nếu có cấu hình).

## Luật chơi (tóm tắt)

- Mỗi lượt đặt 1 quân vào ô trống.
- Nếu nhóm quân đối thủ hết `liberty` sau nước đánh, nhóm đó bị bắt.
- Bắt quân -> được thêm 1 lượt (`extra turn`).
- Cấm nước tự sát, trừ khi nước đó tạo bắt quân.
- Trận kết thúc khi:
   - Hai người chơi `Pass` liên tiếp.
   - Bàn cờ không còn ô trống.
   - Một người chơi `Đầu hàng`.

## Công nghệ sử dụng

- Frontend: React 19 + TypeScript + Vite.
- UI: Tailwind CSS + lucide-react + motion.
- Backend: Express + Socket.IO (chung process với Vite dev server).
- Runtime TypeScript: `tsx`.

## Cấu trúc thư mục

```text
.
|-- server.ts
|-- src/
|   |-- App.tsx
|   |-- components/
|   |   `-- Board.tsx
|   |-- logic/
|   |   `-- gameLogic.ts
|   |-- types.ts
|   |-- index.css
|   `-- main.tsx
|-- package.json
|-- vite.config.ts
`-- tsconfig.json
```

## Yêu cầu môi trường

- Node.js 18+ (khuyến nghị LTS mới).
- npm.

## Chạy local

1. Cài dependencies:

```bash
npm install
```

2. Chạy development server:

```bash
npm run dev
```

3. Mở trình duyệt tại URL server in ra terminal (mặc định `http://localhost:3000`).

Lưu ý:

- Nếu cổng `3000` đang bận, server tự động tìm cổng trong khoảng tiếp theo.
- Vào cùng phòng bằng cách dùng cùng hash URL (ví dụ: `/#abc1234`).

## Chơi cùng bạn (LAN / Internet)

- Bấm nút mời bạn trong UI để copy link phòng.
- Nếu các máy cùng mạng LAN/Wi-Fi, link IP LAN sẽ dùng trực tiếp.
- Nếu muốn truy cập từ mạng ngoài, đặt `PUBLIC_BASE_URL`.

Ví dụ đặt public URL:

PowerShell:

```powershell
$env:PUBLIC_BASE_URL="https://your-domain-or-tunnel"
npm run dev
```

CMD:

```cmd
set PUBLIC_BASE_URL=https://your-domain-or-tunnel
npm run dev
```

Bash:

```bash
PUBLIC_BASE_URL="https://your-domain-or-tunnel" npm run dev
```

## Biến môi trường

| Biến | Bắt buộc | Mặc định | Mô tả |
|---|---|---|---|
| `PORT` | Không | `3000` | Cổng server ưu tiên. Nếu trùng cổng sẽ tự động retry cổng tiếp theo. |
| `PUBLIC_BASE_URL` | Không | Không có | Base URL public dùng để tạo link mời bạn khi chơi qua Internet. |
| `NODE_ENV` | Không | `development` | Đặt `production` để server phục vụ file trong `dist`. |
| `GEMINI_API_KEY` | Không | Không có | Có trong config Vite, không cần thiết cho gameplay hiện tại. |

## Scripts

| Script | Chức năng |
|---|---|
| `npm run dev` | Chạy server + Vite middleware (dev). |
| `npm run start` | Chạy server bằng `tsx server.ts`. |
| `npm run build` | Build frontend với Vite (`dist/`). |
| `npm run preview` | Preview frontend đã build (Vite preview). |
| `npm run lint` | Kiểm tra TypeScript (`tsc --noEmit`). |
| `npm run clean` | Xóa `dist` (lệnh Unix `rm -rf`). |

## Build và chạy production

Build:

```bash
npm run build
```

Chạy production (Bash):

```bash
NODE_ENV=production npm run start
```

Chạy production (PowerShell):

```powershell
$env:NODE_ENV="production"
npm run start
```

## Lưu trữ trạng thái và giới hạn

- Trạng thái phòng/ván đấu đang lưu in-memory trên server (`Map`), sẽ mất khi server restart.
- Lịch sử kết quả trong phiên đang lưu trên client state, reload trang là mất.
- Hiện tại chưa có cơ sở dữ liệu persistent.

## Troubleshooting nhanh

- Không vào được cùng phòng:
   - Kiểm tra có dùng cùng hash URL không.
   - Kiểm tra firewall cho phép Node.js.
- Bạn ở mạng ngoài không vào được link LAN:
   - Cấu hình `PUBLIC_BASE_URL` bằng domain/tunnel public.
- Không chọn được vai:
   - Vai đó đã có người giữ, hoặc socket chưa vào phòng đúng.

## Giấy phép

Hiện tại chưa khai báo license riêng trong repository.
