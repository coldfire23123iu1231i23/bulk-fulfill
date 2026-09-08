# Đưa Bulk Fulfill lên Shopify

Từ code trong máy đến app chạy trong Shopify Admin của Loom Custom.

- Store: `b8t7nn-dr.myshopify.com`
- App ID: `420645470209` · Org: `198828422`
- Client ID: `661ebbd97283bd4b444e81863f66aff3`
- Trang quản lý app: https://dev.shopify.com/dashboard/198828422/apps/420645470209

> **Client secret** lấy ở *App settings → Credentials* (bấm biểu tượng con mắt rồi chép).
> Chỉ dán thẳng vào ô Variables của Railway. Đừng gửi qua chat, đừng chụp màn hình,
> đừng commit vào Git. Lỡ lộ thì bấm **Rotate** ngay tại trang đó.

## Đã làm xong trên Dev Dashboard

- App **Bulk Fulfill** đã tạo trong tổ chức Loom Custom
- Bật **Embed app in Shopify admin**
- Khai 7 quyền đọc/ghi đơn và fulfillment order, để chế độ cài tự động (managed installation)
- Release version `v1-embedded-bulk-fulfill` — đang Active

## Các bước còn lại

### 3. Đưa code lên GitHub

Giải nén `bulk-fulfill.zip`, tạo repo mới trên GitHub (để Private), rồi:

```bash
git init
git add -A
git commit -m "Bulk Fulfill app"
git branch -M main
git remote add origin https://github.com/<tài-khoản>/bulk-fulfill.git
git push -u origin main
```

`.gitignore` đã chặn sẵn `.env` và `node_modules`. Đừng bao giờ commit `.env`.

### 4. Deploy lên Railway

1. **New Project → Deploy from GitHub repo**, chọn repo vừa push
2. Railway tự nhận Node, chạy `npm install` rồi `npm start`
3. Tab **Variables** — thêm đủ biến ở bảng dưới, để nó redeploy
4. **Settings → Networking → Generate Domain** để lấy domain công khai
5. Chép domain lại, bước 5 cần

Kiểm tra nhanh: mở `https://<domain>/healthz`, thấy `{"ok":true}` là server sống.

### 5. Sửa App URL cho khớp domain thật

Lúc tạo app điền tạm `bulk-fulfill-production.up.railway.app`. Domain Railway khác thì
phải sửa, không app mở ra trang trắng.

1. App → **Versions → Create version**
2. **App URL**: `https://<domain-railway>`
3. **Allowed redirection URL(s)**: `https://<domain-railway>/auth/callback`
4. Giữ nguyên **Embed app in Shopify admin** và phần Scopes
5. **Release**

Dùng Shopify CLI thì sửa hai dòng URL trong `shopify.app.toml` rồi `shopify app deploy`.

### 6. Cài app vào store

Trang **Overview** của app → mục **Installs** → **Install app** → chọn
`b8t7nn-dr.myshopify.com` → **Install**.

Custom distribution: app chỉ cài được cho store này, không lên App Store, không cần duyệt.

### 7. Mở và kiểm tra

Shopify Admin → **Apps → Bulk Fulfill**. App phải mở ngay trong giao diện Shopify,
không hỏi mật khẩu, tự tải danh sách đơn chưa fulfill.

## Biến môi trường trên Railway

| Biến | Giá trị | Bắt buộc |
|---|---|---|
| `SHOPIFY_SHOP` | b8t7nn-dr.myshopify.com | bắt buộc |
| `SHOPIFY_API_KEY` | 661ebbd97283bd4b444e81863f66aff3 | bắt buộc |
| `SHOPIFY_API_SECRET` | Client secret — chép từ App settings | bắt buộc |
| `SESSION_SECRET` | Chuỗi ngẫu nhiên tự đặt, càng dài càng tốt | bắt buộc |
| `NODE_ENV` | `production` | bắt buộc |
| `SHOPIFY_API_VERSION` | `2026-07` | nên có |
| `APP_PASSWORD` | Mật khẩu mở app bằng link Railway. Bỏ trống thì ai có link cũng vào được. | nên có |
| `DEFAULT_NOTIFY_CUSTOMER` | `true` / `false` — mặc định có gửi mail báo vận chuyển không | tuỳ chọn |
| `SHOPIFY_ACCESS_TOKEN` | Token `shpat_…` của Custom App cũ. Có thì app dùng luôn; bỏ đi thì app tự đổi lấy token qua Shopify. | tuỳ chọn |

Không đặt `SESSION_SECRET` thì mỗi lần Railway restart, người đang mở app bằng link bị đá ra
đăng nhập lại. Đường vào từ Shopify Admin không ảnh hưởng.

## Kiểm tra sau khi cài

- [ ] `/healthz` trả về `{"ok":true}`
- [ ] Shopify Admin → Apps có **Bulk Fulfill**, bấm vào mở được
- [ ] Mở từ Admin **không** hỏi mật khẩu, góc phải hiện "Đang chạy trong Shopify Admin"
- [ ] Danh sách đơn chưa fulfill hiện ra, đúng số đơn so với trang Orders
- [ ] Dán thử một mã tracking — cột Carrier tự nhận đúng nhà vận chuyển
- [ ] Fulfill thử **một** đơn thật, mở đơn đó trong Shopify xem tracking đã lên chưa
- [ ] Mở link Railway trực tiếp — phải hỏi mật khẩu

> Lần đầu chạy thật: tắt *Gửi mail báo vận chuyển cho khách*, fulfill đúng một đơn trước.
> Fulfillment đã tạo không huỷ lại được, email đã gửi không thu hồi được.

## Gặp lỗi thì xử lý

| Hiện tượng | Nguyên nhân thường gặp | Cách sửa |
|---|---|---|
| Mở app trong Admin ra trang trắng | App URL chưa khớp domain Railway | Làm lại bước 5 |
| "Chưa cấu hình SHOPIFY_API_KEY / SHOPIFY_API_SECRET" | Thiếu biến, hoặc chưa redeploy | Kiểm tra Variables, bấm Redeploy |
| "Session token không dành cho app này" | `SHOPIFY_API_KEY` không phải Client ID của app đang mở | Chép lại Client ID từ App settings |
| "Token Shopify sai hoặc thiếu quyền" | App cài trước khi khai đủ scope | Release version mới rồi cài lại app |
| Danh sách đơn trống dù store có đơn | Bộ lọc ngày, hoặc đang tick "Chỉ đơn đã thanh toán" | Nới khoảng ngày, bỏ tick thử |
| Không thấy đơn cũ hơn 60 ngày | Shopify giới hạn, cần `read_all_orders` | Xin duyệt quyền đó trong API access |
| Fulfill báo "Ma tracking khong hop le" | Mã tracking có ký tự lạ, hoặc đơn đã fulfill nơi khác | Mở đơn trong Shopify kiểm tra trạng thái |
| Carrier nhận sai | Mã trùng format với hãng khác | Chọn tay ở dropdown, hoặc nút **Đồng bộ carrier** |

---

Sửa cấu hình app sau này (URL, quyền, chế độ embed): phải qua **Versions → Create version → Release**.
Sửa code: chỉ cần push lên GitHub, Railway tự deploy lại.
