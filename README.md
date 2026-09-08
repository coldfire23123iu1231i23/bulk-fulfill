# Bulk Fulfill — Loom Custom

App fulfill hàng loạt cho Shopify. Hiện danh sách đơn **chưa fulfill**, nhập mã tracking
cho từng đơn, app **tự nhận diện shipping provider** từ format mã, rồi đẩy fulfillment
lên Shopify hàng loạt bằng Admin GraphQL API.

## Chức năng

- Danh sách đơn chưa fulfill / fulfill một phần (lọc theo ngày, đơn đã thanh toán, tìm theo số đơn / email / SKU)
- Hiện đủ: số đơn, ngày, khách, địa chỉ giao, ảnh + SKU + số lượng từng sản phẩm, shipping method, kho gán đơn
- Ô nhập tracking mỗi dòng — bấm **Enter** để nhảy xuống dòng dưới, nhập liên tay không cần chuột
- **Tự nhận carrier**: USPS, UPS, FedEx, DHL Express, DHL eCommerce, YunExpress, 4PX, China Post,
  Royal Mail, Australia Post, Japan Post, Canada Post, SF Express, Sendle… Nhận sai thì đổi tay bằng dropdown
- Đổi carrier hàng loạt cho mọi đơn đã chọn (nút **Đồng bộ carrier**)
- Một đơn nhiều kiện: nhập nhiều mã cách nhau bằng dấu phẩy
- Bật/tắt gửi email báo vận chuyển cho khách
- Bảng kết quả từng đơn sau khi chạy, đơn lỗi hiện rõ lý do
- Có mật khẩu bảo vệ app

## Cài đặt

### 1. Tạo Custom App trên Shopify

1. Shopify Admin → **Settings → Apps and sales channels → Develop apps → Create an app**
2. Đặt tên (ví dụ `Bulk Fulfill`) → **Configure Admin API scopes**, tick các quyền:
   - `read_orders`
   - `read_fulfillments`
   - `write_fulfillments`
   - `read_merchant_managed_fulfillment_orders`
   - `write_merchant_managed_fulfillment_orders`
   - `read_assigned_fulfillment_orders` (nếu có nhà in dùng app fulfillment service)
3. **Save → Install app** → copy **Admin API access token** (dạng `shpat_...`).
   Token chỉ hiện **một lần**, lưu lại ngay.

> Đơn quá 60 ngày: cần thêm quyền `read_all_orders` (phải xin duyệt trong phần API access).

### 2. Deploy lên Railway

1. Push code này lên một repo GitHub
2. Railway → **New Project → Deploy from GitHub repo** → chọn repo
3. Vào tab **Variables**, thêm:

| Biến | Giá trị |
|---|---|
| `SHOPIFY_SHOP` | `b8t7nn-dr.myshopify.com` |
| `SHOPIFY_ACCESS_TOKEN` | token `shpat_...` ở bước 1 |
| `SHOPIFY_API_VERSION` | `2026-07` |
| `APP_PASSWORD` | mật khẩu tự đặt để vào app |
| `SESSION_SECRET` | chuỗi ngẫu nhiên bất kỳ (giữ đăng nhập khi restart) |
| `DEFAULT_NOTIFY_CUSTOMER` | `true` hoặc `false` |
| `NODE_ENV` | `production` |

> Muốn app hiện luôn trong Shopify Admin thì làm tiếp phần **Đưa app vào Shopify Admin** bên dưới.

4. Tab **Settings → Networking → Generate Domain** để lấy link công khai
5. Mở link, nhập mật khẩu, xong

Railway tự chạy `npm install` rồi `npm start`. Healthcheck ở `/healthz`.

### 3. Chạy thử ở máy

```bash
cp .env.example .env      # điền token vào
npm install
node --env-file=.env src/server.js
# mở http://localhost:3000
```

## Dùng hàng ngày

1. Chọn khoảng ngày → **Tải đơn**
2. Click ô tracking đơn đầu tiên, dán mã → **Enter** → nhảy xuống đơn kế → dán tiếp
   (dòng nào có tracking tự được tick chọn)
3. Liếc cột **Carrier** — chữ xanh là tự nhận chắc chắn, chữ cam là không chắc, nên kiểm lại
4. Bật/tắt *Gửi mail báo vận chuyển cho khách*
5. **Fulfill N đơn** → xác nhận → xem bảng kết quả

Mẹo: nếu cả lô cùng một nhà vận chuyển, chọn ở ô **Đổi carrier hàng loạt** góc phải để ép hết một lượt.

## Đưa app vào Shopify Admin (embedded)

Sau bước này app hiện trong menu **Apps** của Shopify Admin, bấm vào là chạy ngay
trong giao diện Shopify, không cần nhập mật khẩu nữa — Shopify tự xác thực.
Link Railway + mật khẩu vẫn dùng song song được.

### 1. Tạo app trên Partner Dashboard

1. Vào [partners.shopify.com](https://partners.shopify.com) → **Apps → Create app → Create app manually**
2. Đặt tên `Bulk Fulfill`
3. Vào **Configuration**, điền:
   - **App URL**: `https://<domain-railway>.up.railway.app`
   - **Allowed redirection URL(s)**: `https://<domain-railway>.up.railway.app/auth/callback`
   - **Embed app in Shopify admin**: bật
4. Sang tab **API credentials** (hoặc **Client credentials**), copy **Client ID** và **Client secret**

### 2. Khai báo quyền

Sửa `shopify.app.toml`: thay `client_id` và `application_url` bằng của anh, rồi:

```bash
npm i -g @shopify/cli
shopify app deploy
```

Shopify dùng **managed installation** — tự xin quyền khi cài, không cần luồng OAuth redirect.
Nếu không muốn dùng CLI, vào Partner Dashboard tick tay các scope trong `[access_scopes]` của file toml.

### 3. Thêm biến môi trường trên Railway

| Biến | Giá trị |
|---|---|
| `SHOPIFY_API_KEY` | Client ID ở bước 1 |
| `SHOPIFY_API_SECRET` | Client secret ở bước 1 |

Xong redeploy.

### 4. Cài app vào store

Partner Dashboard → app → **Distribution → Custom distribution** → nhập
`b8t7nn-dr.myshopify.com` → lấy link cài → mở link → **Install**.

Custom distribution nghĩa là app chỉ cài được cho store này, không lên App Store,
không cần Shopify duyệt.

Xong: Shopify Admin → **Apps → Bulk Fulfill**.

### App lấy access token kiểu nào?

- **Còn `SHOPIFY_ACCESS_TOKEN`** (token Custom App) → app dùng luôn token đó. Đơn giản nhất,
  và là cách đang chạy hiện tại.
- **Bỏ `SHOPIFY_ACCESS_TOKEN`** → app tự đổi session token của Shopify lấy access token
  (*token exchange*) và cache lại trong bộ nhớ. Lúc này quyền lấy theo `[access_scopes]`
  trong `shopify.app.toml`, không cần Custom App nữa.

Cả hai đều chạy được. Muốn gọn còn một app thì bỏ `SHOPIFY_ACCESS_TOKEN` đi.

### Bảo mật

- Mọi request từ trong Shopify Admin đều kèm session token, server kiểm chữ ký HS256
  bằng client secret + kiểm `exp` / `nbf` / `aud` / `iss`-`dest` trước khi làm gì
- Token hết hạn giữa chừng → server trả `401` kèm `X-Shopify-Retry-Invalid-Session-Request`,
  App Bridge tự lấy token mới và thử lại
- Header `Content-Security-Policy: frame-ancestors` chỉ cho phép nhúng từ Shopify Admin và
  chính store của anh — trang khác nhúng app sẽ bị Chrome chặn
- Access token không bao giờ gửi xuống trình duyệt

## Lưu ý kỹ thuật

- Dùng `fulfillmentCreate` (Admin GraphQL 2026-07) trên các `FulfillmentOrder` — không dùng
  REST fulfillment cũ đã bỏ
- Đơn giao từ nhiều kho → app tạo fulfillment riêng cho từng fulfillment order, cùng mã tracking
- Tên carrier gửi lên đúng chuẩn danh sách Shopify hỗ trợ nên Shopify tự sinh link tracking cho khách.
  Không nhận ra thì gửi `Other` — khách vẫn thấy mã, chỉ không có link bấm
- Tự retry khi bị Shopify throttle, giãn nhịp 300ms mỗi lần gọi
- Giới hạn 250 đơn / lượt fulfill
- Hai đường vào dùng chung một codebase: nhúng trong Shopify Admin (session token App Bridge)
  hoặc mở link Railway (cookie phiên sau khi nhập mật khẩu)

## Test

```bash
npm test
```

Kiểm tra logic nhận diện carrier, chuỗi query Shopify, xác thực session token
(sai chữ ký / hết hạn / sai app / shop giả mạo / `alg: none`), và độ khớp giữa logic
ở server và ở trình duyệt.

Muốn xem giao diện với dữ liệu giả, không đụng tới Shopify thật:

```bash
node test/mockserver.mjs   # mở http://localhost:3999
```
