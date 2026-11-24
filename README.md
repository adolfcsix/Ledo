# Ledo

Phần mềm kế toán chạy local bằng Node.js, giao diện React + Tailwind CSS và SQLite lưu trên đĩa. Bản vận hành có tài khoản Ledo riêng; dữ liệu được lưu theo đơn vị và phạm vi chi nhánh. Site là môi trường trình diễn riêng.

## Cài đặt và chạy

1. Cài Node.js 24. Mở thư mục `LEDO` bằng VS Code.
2. Mở terminal trong thư mục này và chạy:

   ```sh
   npm ci
   npm run dev
   ```

3. Mở [http://127.0.0.1:4173](http://127.0.0.1:4173). Khi chưa có tài khoản, nhập mã thiết lập in trên terminal, email và mật khẩu từ 12 ký tự để tạo tài khoản đầu tiên. Các lần sau đăng nhập bằng email và mật khẩu.
4. Chọn **Chọn đơn vị → Tạo đơn vị**. Điền tháng hạch toán, tiền mặt và tiền gửi ngân hàng đầu kỳ. Tên mặt hàng đầu tiên là tùy chọn. Hai khoản tiền đầu kỳ của chi nhánh chính được đối ứng vốn đầu kỳ. Đơn vị mới không tải sổ mẫu An Phát.
5. Vào **Người dùng và phân quyền → Thêm người dùng**, gán vai trò và chi nhánh, rồi chuyển link mời qua kênh nội bộ. Người mới chọn **Tôi chưa có tài khoản**, đặt mật khẩu bằng đúng email được mời, rồi xác nhận tham gia. Người đã có tài khoản đăng nhập trước khi xác nhận lời mời. Cần người dùng độc lập để duyệt hồ sơ mình lập.
6. Để thử mà không đưa dữ liệu thật vào, chạy `npm run demo` sau khi dừng bản vận hành. Chế độ này dùng bộ An Phát và dữ liệu trong bộ nhớ. Dùng `npm run demo:reports` để mở bộ minh họa tài chính nhiều ngày, cũng chạy trong bộ nhớ. Bấm vai trò ở góc trên, chọn **Lãnh đạo** hoặc **Kế toán trưởng**, rồi mở **Tổng quan tài chính**.

Sau khi đã build, có thể dùng `npm start` để khởi động lại mà không cần build lại. Mặc định chương trình chỉ nghe trên máy đang chạy. Link mời local dùng trên máy đó. Có thể đổi cổng bằng biến môi trường `PORT`, và đổi đường dẫn database bằng `LEDO_DB`. Mở được bằng trình duyệt mà không cần ChatGPT hay Sites.

## Dữ liệu và sao lưu

Tệp mặc định là `data/ledo.sqlite`. Giữ cùng thư mục này khi cập nhật mã nguồn. Dừng Ledo trước khi sao lưu hoặc phục hồi rồi sao chép **toàn bộ thư mục data** vào nơi lưu được bảo vệ. Để phục hồi, dừng Ledo và giữ một bản sao dữ liệu hiện có trước khi thay thư mục. Sau khi chạy lại, đối chiếu số dư, kỳ và một số chứng từ đã ghi sổ. Gói mã nguồn không chứa dữ liệu nghiệp vụ, mật khẩu hoặc khóa thiết lập. Không có thao tác chuyển dữ liệu từ Site sang local.

## Phạm vi đã làm

- Khởi tạo quản trị, đăng nhập, đăng xuất, cấp mã mời, gán vai trò và hạn mức, đổi vai trò được cấp, ngừng quyền và nhật ký cấp quyền.
- Thiết lập một kỳ tháng cho đơn vị, hạch toán VND và theo dõi nhiều mã hàng theo kho được cấp. Luồng mua, nhận hàng, đối chiếu số lượng nhập, lập nháp, duyệt độc lập và ghi sổ liên kết với công nợ. Có luồng bán hàng, thu chi, ghép sao kê thủ công và chốt kỳ trong phạm vi hiện tại.
- Kiến trúc dự án và quyền dựa trên tài liệu Ledo, đặc biệt các chương 14–17. Mô hình mời người dùng và gán phạm vi tham khảo AMIS Kế toán.

Phạm vi trước khi vận hành rộng hơn gồm chuyển kỳ, nhiều dòng hàng trong một đơn, nhập danh mục và số dư hàng loạt, số dư cho các tài khoản ngoài nhóm hiện có, tích hợp hóa đơn điện tử và thuế, gửi email mời tự động, đặt lại mật khẩu, MFA, HTTPS và triển khai nhiều máy. Các mục này chưa thuộc bản đóng gói. Đối chiếu nghiệp vụ, quy định và số liệu với kế toán phụ trách trước khi dùng làm sổ chính thức.

## Bàn làm việc và quyền theo vai trò

| Vai trò | Màn hình và thao tác chính |
|---|---|
| Kế toán nghiệp vụ | Mở đúng nháp của mình, phiếu và đơn bị trả về hoặc sao kê chưa ghép. Tạo đơn mua hoặc bán từ bàn làm việc. |
| Thủ kho | Tách đơn chờ giao nhận, toàn bộ giao nhận và biên bản kiểm kê. Tra thẻ kho theo số lượng. |
| Thủ quỹ | Tách phiếu chờ xác nhận, phiếu đã xác nhận chờ ghi sổ, phiếu đã ghi sổ và kiểm kê quỹ. |
| Người phê duyệt | Lọc đơn hoặc chứng từ chờ duyệt trong hạn mức, loại hồ sơ do chính mình lập. Có lối tắt riêng cho yêu cầu mở kỳ. |
| Kế toán trưởng | Rà chứng từ đã duyệt, chờ ghi, phê duyệt, ngân hàng, giải trình và các vướng mắc trước khi khóa kỳ. |
| Lãnh đạo | Mở tổng quan tài chính và theo dõi giải trình trong phạm vi được cấp. |
| Kiểm toán / Kiểm soát | Mở bằng chứng, sổ và báo cáo, thẻ kho và gửi yêu cầu bằng chứng. |
| Quản trị tổ chức | Mở **Người dùng và phân quyền → Vai trò** để tra màn hình, thao tác và điều kiện của từng vai trò có thể cấp. |
| Chuyên viên tiền lương | Lập nháp cá nhân và chuyển số tổng theo kỳ cho kế toán trưởng. |
| Đối tác và tài khoản dịch vụ | Hai vai trò trong bản thực hành có lối tắt đến hồ sơ công nợ được chia sẻ và màn hình sự kiện mô phỏng. |

Các danh sách lọc dùng cùng tiêu chí với số đếm trên bàn làm việc. Quyền ghi, phạm vi chi nhánh, hạn mức và nguyên tắc duyệt độc lập được kiểm tra trên máy chủ. Ma trận cho biết quyền chuẩn của vai trò. Quyền ghép phiếu đã ghi bổ sung, ngày hết hạn và phạm vi thực tế xem trên từng tài khoản.

Tài liệu đối chiếu giao diện và cách tổ chức nghiệp vụ [Thủ kho](https://helpact.misa.vn/kb/html_26000000/), [Thủ quỹ](https://helpact.misa.vn/kb/html_25000000/), [Vai trò và quyền hạn](https://helpact.misa.vn/kb/phan-quyen-cho-vai-tro/) và [Tổng quan](https://helpact.misa.vn/kb/tong-quan/) của AMIS Kế toán.

## Tiện ích và thiết lập

Mở **Tiện ích** trên thanh trên cùng để tìm nhanh theo tên màn hình hoặc nội dung công việc. Ví dụ, gõ `quan ly danh muc` để tìm danh mục, hoặc `chot ky` để tìm bảng kiểm cuối kỳ. Ledo dùng quyền của vai trò đang chọn để xác định các lối tắt hiển thị.

- **Kế toán nghiệp vụ** có lối vào danh mục, số dư đầu kỳ, chứng từ, đối chiếu ngân hàng và công nợ.
- **Kế toán trưởng** có thêm kiểm tra trước khi chốt kỳ, giải trình, phê duyệt và báo cáo.
- **Quản trị tổ chức** có thể mở thẳng ma trận quyền qua **Tiện ích → Ma trận quyền nghiệp vụ**.
- **Thủ kho** và **Thủ quỹ** thấy lối vào các phân hệ được cấp của mình. Trên điện thoại, mục đăng xuất của bản vận hành nằm trong nhóm **Đơn vị và tài khoản**.

## Sổ chứng từ

Chọn trạng thái ở hàng tab, sau đó tìm theo mã, đối tác hoặc diễn giải. Có thể lọc theo nghiệp vụ và khoảng ngày, sắp xếp và xuất toàn bộ kết quả đang lọc ra CSV. Thanh bên có nút thu gọn trên desktop và lưu lựa chọn trong trình duyệt.

Người lập có thể mở bản nháp thông thường vừa hủy tại **Chứng từ → Đã hủy** rồi chọn **Phục hồi bản nháp**. Máy chủ kiểm tra kỳ, chi nhánh, người lập và nguồn phát sinh. Nếu phiếu giao nhận đã được dùng hoặc công nợ còn lại đã đổi làm phiếu không còn hợp lệ, hệ thống từ chối phục hồi. Bản nháp phục hồi đi qua luồng duyệt và ghi sổ bình thường. Màn chi tiết hiển thị tối đa 12 sự kiện gần nhất từ nhật ký chứng từ. Dữ liệu đã bị xóa vật lý bởi bản cũ không có bản lưu để phục hồi.

## Kiểm tra chứng từ và sổ sách

- **Kế toán trưởng** và **Kiểm toán / Kiểm soát** có mục **Tiện ích → Kiểm tra chứng từ và sổ sách**. Kiểm tra tổng Nợ và Có, đối chiếu TK 156 với thẻ kho và TK 131/331 với công nợ chi tiết, rà mã hàng thiếu, công nợ âm và quỹ âm. Chọn ngày để tính đến hết ngày đó, bao gồm số đầu kỳ. Bật **Chỉ hiện mục cần rà** để rút gọn danh sách. Mở **Xem số liệu** để lọc các dòng sổ cái, thẻ kho hoặc công nợ chi tiết, mở chứng từ nguồn và xuất CSV theo bộ lọc. Cảnh báo nêu rõ các dòng thiếu mã hàng bị loại khỏi tổng thẻ kho theo mã.
- Tại **Bằng chứng và giải trình**, Kiểm toán / Kiểm soát xem và tải nhật ký CSV của chứng từ đã ghi sổ trong chi nhánh được cấp cùng dấu vết các yêu cầu bằng chứng do mình gửi. Các dòng chứng từ có mã lô vẫn giữ mã đó để tra vết.
- Kế toán trưởng xem thêm số hồ sơ đang vướng trước khi chốt kỳ và mở phân hệ xử lý. Kiểm soát chỉ nhận báo cáo đối chiếu từ dữ liệu đã ghi sổ và dùng các lối tra cứu đọc.
- **Kế toán nghiệp vụ** và **Kế toán trưởng** dùng **Tiện ích → Ngày hạch toán mặc định** để điền trước ngày trong kỳ đang mở. Ledo lưu lựa chọn trong tab theo tài khoản, vai trò, chi nhánh và kỳ. Form vẫn cho đổi ngày, dữ liệu đã lưu giữ nguyên.
- Trong bản vận hành, **Tiện ích → Thông tin đơn vị** hiển thị chi nhánh, vai trò và kỳ đang làm việc. Quản trị có lối vào quản lý người dùng từ khung này.

## Tùy chỉnh tổng quan tài chính

Lãnh đạo và Kế toán trưởng có thể bật, tắt biểu đồ, công nợ, đối chiếu phát sinh và số dư/tồn kho trong **Tùy chỉnh tổng quan**. Tùy chọn được lưu trong trình duyệt theo người dùng, vai trò và chi nhánh. Có thể khôi phục bố cục mặc định. Trong khung **Đối chiếu phát sinh**, xuất dữ liệu ngày của biểu đồ đang chọn ra CSV với giá trị VND, theo khoảng được chọn trên biểu đồ hoặc toàn kỳ.

## Xử lý chứng từ theo lô

Mở từ trang nghiệp vụ hoặc tìm công cụ trong **Tiện ích**. Lọc theo ngày hạch toán, loại chứng từ, mã phiếu hoặc đối tác. Mỗi lô chứa tối đa 25 phiếu. Bộ lọc chỉ đổi danh sách đang xem. Phiếu đã chọn ngoài bộ lọc vẫn xuất hiện trong bảng rà soát trước khi xác nhận.

| Vai trò | Công cụ | Điều kiện |
|---|---|---|
| Kế toán nghiệp vụ và Kế toán trưởng | Gửi duyệt theo lô | Chỉ gửi phiếu nháp do chính người đang thao tác lập. |
| Người phê duyệt và Kế toán trưởng | Duyệt theo lô | Kiểm tra người duyệt độc lập, hạn mức từng phiếu và tuyến duyệt lương. |
| Thủ quỹ | Xác nhận quỹ theo lô | Nhập số thực tế từng phiếu. Phiếu chi được kiểm tra với số dư khả dụng sau khi trừ các khoản đã xác nhận chờ ghi. |
| Kế toán trưởng | Ghi sổ theo lô | Máy chủ áp dụng kiểm tra hiện hành cho từng phiếu theo thứ tự ngày hạch toán. |

**Kiểm tra lô** chạy thử trên bản dữ liệu tạm, cho biết mã phiếu đầu tiên vướng điều kiện. Nếu lô qua kiểm tra, rà danh sách rồi xác nhận. Máy chủ kiểm tra lại trên phiên bản dữ liệu đã xem, ghi toàn bộ lô một lần và lưu dấu vết theo từng phiếu. Nếu một phiếu có lỗi hoặc dữ liệu đã đổi, lô không ghi dở dang. Kỳ đã khóa không có thao tác theo lô.

Tham khảo cách lọc và xử lý hàng loạt trong [Ghi sổ theo lô](https://helpact.misa.vn/kb/ghi-so-bo-ghi-theo-lo/) và [Thủ quỹ](https://helpact.misa.vn/kb/html_25000000/) của AMIS Kế toán.

## Danh mục và kho

- Kế toán nghiệp vụ và Kế toán trưởng vào **Thiết lập → Danh mục** để thêm mã hàng hoặc đối tác. Đối tác được khai theo nhóm khách hàng, nhà cung cấp hoặc cả hai. Mã và đơn vị tính giữ cố định sau khi tạo, có thể sửa tên.
- Ngày bắt đầu và ngày ngừng chi phối bộ chọn theo ngày hạch toán. Đơn hàng và chứng từ giữ mã/tên đã ghi nhận. Nếu đổi tên đối tác, ghép sao kê tiếp tục dùng định danh của đối tác. Không gộp đối tác dựa vào tên hiển thị khi lập dữ liệu mới.
- Mỗi đơn hiện có một dòng hàng. Có thể lập nhiều đơn với nhiều mã hàng. Tồn kho, giữ chỗ khi giao hàng, kiểm kê và giá vốn bình quân được tính riêng theo mã tại chi nhánh. Thủ kho chỉ thấy số lượng. Kế toán trưởng thấy cả trị giá tồn kho. Tổng quan tài chính đếm số mã còn tồn thay vì cộng số lượng khác đơn vị.
- Khi mở dữ liệu local từ bản cũ, Ledo gán mặt hàng cũ vào mã `VT001` và đối tác cũ vào nhóm mã `DT…` theo tên nguyên bản có trong sổ. Ledo giữ nguyên bút toán, số tiền và nội dung chứng từ. Một lần lưu hợp lệ sẽ ghi danh mục đã chuyển đổi vào dữ liệu.

## Thẻ kho và nhập xuất tồn

Mở **Nghiệp vụ → Thẻ kho và nhập xuất tồn** hoặc chọn **Mở thẻ kho** từ Giao nhận và kiểm kê hay Mua hàng và bán hàng. Báo cáo lấy theo kho của chi nhánh và khoảng ngày trong kỳ đang mở.

| Mục | Nội dung |
|---|---|
| Tổng hợp nhập xuất tồn | Mỗi dòng là một mã hàng, có tồn đầu khoảng, nhập, xuất và tồn cuối. Tìm theo mã hoặc tên, bấm mã để xem chi tiết. |
| Thẻ kho | Xem ngày, mã chứng từ, đối tác và số tồn sau mỗi dòng đã ghi sổ. Với nhiều chứng từ cùng ngày, Ledo ưu tiên thứ tự ghi sổ. Dữ liệu lịch sử dùng nhật ký khi có và thứ tự lưu khi thiếu nhật ký. |
| Giá vốn | Kế toán, Kế toán trưởng và Kiểm soát xem trị giá. Trị giá xuất lấy giá vốn trên chứng từ đã ghi sổ. Đổi bộ lọc ngày không tính lại giá vốn. |
| Thủ kho | Xem số lượng trong kho được giao. Dữ liệu trả về cho vai trò này và tệp CSV không chứa trị giá. |
| Tệp CSV | Xuất thẻ kho của mặt hàng đang xem hoặc bảng tổng hợp theo bộ lọc. Có mã kho, mã hàng, đơn vị và khoảng ngày. |

Ví dụ, đầu kỳ có 3 cái trị giá 150.000 đồng, nhập thêm 2 cái trị giá 130.000 đồng ngày 4 và xuất 2 cái với giá vốn 112.000 đồng ngày 7. Khi xem từ ngày 7, tồn đầu khoảng là 5 cái trị giá 280.000 đồng và tồn cuối còn 3 cái trị giá 168.000 đồng. Phiếu giao nhận, biên bản kiểm kê và chứng từ nháp chưa làm đổi thẻ kho.

Tham khảo [Báo cáo kho của MISA AMIS](https://helpact.misa.vn/kb/html_35080000/). Báo cáo hiện theo mã hàng và một kho của chi nhánh. Các lớp theo lô, hạn dùng, vị trí lưu trữ và quy đổi đơn vị chưa có trong bản này.

### Xử lý chênh lệch kiểm kê kho

1. **Thủ kho** ghi mặt hàng, ngày kiểm kê và số đếm thực tại **Giao nhận và kiểm kê**. Biên bản giữ số theo sổ tại thời điểm đếm.
2. **Kế toán** mở biên bản trong **Mua hàng và bán hàng → Biên bản kiểm kê kho**. Chọn **Lập nháp điều chỉnh**, điền ngày hạch toán và căn cứ. Với phần thiếu, Ledo xác định trị giá theo tỷ lệ bình quân của số lượng thiếu trên tồn kho. Với phần thừa, kế toán nhập tổng trị giá có căn cứ.
3. Người khác duyệt theo quyền và hạn mức. **Kế toán trưởng** ghi sổ. Biên bản, chứng từ, thẻ kho và sổ tài khoản liên kết bằng mã hồ sơ.
4. Nếu số liệu kho đổi hoặc có lần đếm mới, Ledo chặn ghi phiếu cũ. Kế toán trưởng có thể hủy phiếu chưa ghi, lưu lý do rồi thực hiện kiểm kê mới. Có thể đóng biên bản có giải trình nếu chênh lệch do số đếm sai hoặc đã xử lý qua chứng từ thích hợp.

| Trường hợp chưa xác định nguyên nhân | Bút toán khi ghi sổ |
|---|---|
| Thừa hàng hóa | Nợ 156 / Có 3381 |
| Thiếu hàng hóa | Nợ 1381 / Có 156 |

Ví dụ, sổ có 6 cái trị giá 600.000 đồng, thực đếm 4 cái. Phiếu xuất thiếu ghi 2 cái trị giá 200.000 đồng. Sau khi ghi sổ, tồn còn 4 cái, trị giá 400.000 đồng, dư Nợ 1381 là 200.000 đồng. Số tiền gửi, doanh thu và công nợ khách hàng không phát sinh từ phiếu này.

Tham khảo [Kiểm kê kho của MISA AMIS](https://helpact.misa.vn/kb/kiemkekho/). Khi đã xác định nguyên nhân và có quyết định, mở phần **Theo dõi xử lý chênh lệch** trên chứng từ điều chỉnh đã ghi sổ. Chọn **Lập quyết định xử lý**. Mỗi quyết định có thể xử lý một phần hoặc toàn bộ số còn được lập và chia sang hai tài khoản phù hợp.

| Nguồn | Các lựa chọn theo quyết định |
|---|---|
| Nợ 1381 từ xuất thiếu | Nợ 1388 nếu ghi nhận phải thu bồi thường, hoặc Nợ 632 với phần doanh nghiệp chịu. Có 1381 trên từng dòng. |
| Có 3381 từ nhập thừa | Nợ 3381 trên từng dòng. Có 3388 nếu ghi nhận phải trả khác, hoặc Có 711 nếu quyết định ghi thu nhập khác. |

Khai đối tượng khi chọn 1388 hoặc 3388. Lưu số quyết định, ngày và lý do rồi gửi duyệt theo luồng chứng từ. Phiếu nháp/chờ duyệt/đã duyệt giữ phần số dư có thể lập. Phiếu hủy trả lại phần giữ. Chỉ phiếu ghi sổ làm giảm số treo 1381/3381. Bảng theo dõi dẫn về cả biên bản, điều chỉnh gốc và các quyết định đã lập.

Ví dụ, khoản thiếu 200.000 đồng có thể xử lý trước 60.000 đồng phải thu bồi thường và 40.000 đồng tính vào 632. Sau khi ghi sổ, 1381 còn 100.000 đồng. Phiếu xử lý không thay đổi số lượng tồn, không ghi thu hoặc chi tiền. Khi quyết định đã ghi sổ và có dòng 1388 hoặc 3388, mở quyết định và chọn **Lập phiếu thu bồi thường** hoặc **Lập phiếu chi khoản phải trả**. Có thể ghi một phần theo từng số phiếu tham chiếu. Kế toán gửi duyệt, người khác duyệt, Thủ quỹ xác nhận đúng số thực nhận/chi rồi Kế toán trưởng ghi sổ. Thu tiền mặt ghi Nợ 111 / Có 1388. Chi tiền mặt ghi Nợ 3388 / Có 111. Các khoản này hiện riêng theo quyết định và không thay đổi công nợ khách hàng hoặc nhà cung cấp.

Ledo giữ phần phải thu/trả đã dùng cho phiếu đang chờ, kiểm tra tham chiếu trùng và khi xác nhận chi thì trừ các phiếu chi đã xác nhận đang chờ ghi khỏi số quỹ có thể dùng. Xem số đã ghi, còn trên sổ và các phiếu đang chờ tại **Mua hàng và bán hàng → Thu chi theo quyết định kiểm kê**. Luồng này áp dụng tiền mặt, chưa hỗ trợ chuyển khoản, khấu trừ lương hoặc nhiều kỳ.

## Số dư đầu kỳ

Trên bản vận hành, vào **Thiết lập → Số dư đầu kỳ** theo chi nhánh. Có thể nhập tiền mặt (111), tiền gửi (112), phải trả người lao động (334), vốn đầu kỳ (411), tồn kho theo mã hàng (156), phải thu (131) và phải trả (331) theo đối tác và số chứng từ gốc. Danh mục cần có hiệu lực từ ngày mở sổ hoặc trước đó. Hạn thanh toán là tùy chọn. Một bộ số dư hỗ trợ tối đa 40 dòng kho và công nợ cộng lại.

Ví dụ, khai báo 20.000 đồng tiền mặt, 300.000 đồng tiền gửi, 150.000 đồng tồn, 90.000 đồng phải thu, 120.000 đồng phải trả và 15.000 đồng phải trả người lao động. Vốn đầu kỳ là 425.000 đồng. Tổng Nợ và Có đều là 560.000 đồng.

1. Kế toán nhập, đối chiếu tổng và chọn **Lưu bản chờ áp dụng**. Sổ vẫn hiển thị số dư đã áp dụng trước đó.
2. Kế toán trưởng kiểm tra bản đang chờ, chọn **Áp dụng bản đã lưu**. Nếu cần thay đổi, có thể sửa và lưu lại hoặc bỏ bản đang chờ. Ledo kiểm lại Nợ và Có khi áp dụng.
3. Sau khi áp dụng, xem số đầu kỳ tại **Sổ và báo cáo**, dùng **Công nợ** để tra chứng từ gốc và lập phiếu thu, chi hoặc đối chiếu sao kê. Kho đầu kỳ là nguồn số lượng và trị giá khi tính giá vốn.

Chi nhánh áp dụng trước khi phát sinh chứng từ, đơn, sao kê, kiểm kê hoặc chốt kỳ. Tài khoản tiền mặt, tiền gửi và vốn đầu kỳ của dự án cũ được lấy làm giá trị ban đầu. Số dư đầu kỳ không tạo doanh thu, giá vốn hay dòng tiền trong tháng. Có thể nhập trực tiếp hoặc dùng tệp Excel theo bộ tài khoản hỗ trợ.

### Nhập từ Excel

Mở **Thiết lập → Số dư đầu kỳ → Nhập từ Excel**, kiểm tra chi nhánh và kỳ hiển thị rồi chọn **Tải tệp mẫu Excel**. Tệp có sẵn một trang Hướng dẫn có ví dụ cân Nợ/Có và ba trang để nhập dữ liệu.

| Trang tính | Nội dung và quy tắc |
|---|---|
| **Tài khoản** | Điền đủ mã 111, 112, 334 và 411, mỗi mã một dòng. Điền số nguyên VND, dùng 0 nếu tài khoản không có số dư. |
| **Tồn kho** | Điền mã hàng theo Danh mục, số lượng nguyên dương và tổng trị giá tồn VND. Mỗi mã hàng một dòng trong chi nhánh. |
| **Công nợ** | Điền 131 cho phải thu, 331 cho phải trả, mã đối tác, số chứng từ gốc dạng văn bản, ngày chứng từ và số dư. Hạn thanh toán tùy chọn. Dùng ngày Excel hoặc ngày dạng `dd/MM/yyyy` hay `yyyy-mm-dd`. |

Tệp phải ở dạng `.xlsx`, tối đa 2 MB. Giữ nguyên tên trang tính và thứ tự cột. Dán giá trị tĩnh khi chép từ bảng có công thức. Ví dụ, chứng từ `00017` cần được giữ dưới dạng văn bản để Excel không bỏ số 0 đầu.

1. Chọn tệp, đọc phản hồi theo **trang tính và số dòng Excel**. Ví dụ `Tồn kho · Dòng 7` có thể báo mã hàng chưa hiệu lực ở ngày mở sổ. Chỉnh tệp rồi chọn lại.
2. Khi không còn lỗi theo dòng, màn hình hiển thị ba bảng và tổng Nợ, tổng Có, chênh lệch. Tệp lệch Nợ/Có chỉ xem được.
3. Với tệp cân, xác nhận thay dữ liệu đang nhập rồi chọn **Đưa số liệu vào biểu mẫu**. Thao tác này chỉ thay các trường đang mở trên trình duyệt. Dữ liệu chờ và sổ giữ nguyên cho tới khi người dùng thực hiện luồng lưu và áp dụng ở trên.

| Nội dung đối chiếu | MISA AMIS | Phạm vi Ledo |
|---|---|---|
| Tệp và xem trước | Có tệp mẫu, chọn trang tính và ghép cột cho tệp tự chuẩn bị. | Một mẫu cho ba nhóm, kiểm tra cùng lúc và chỉ rõ lỗi theo trang tính, dòng. |
| Mức chi tiết | Có nhóm tài khoản, công nợ, ngân hàng và tồn kho. Hỗ trợ các trường mở rộng theo nghiệp vụ như kho, lô và mã quy cách. | Tồn theo mã hàng tại chi nhánh; công nợ theo đối tác và chứng từ; số liệu bằng VND. |
| Kiểm soát trước khi lên sổ | Có các bước kiểm tra dữ liệu khi nhập khẩu. | Xem tổng Nợ/Có của toàn bộ tệp, nạp vào biểu mẫu, lưu bản chờ riêng rồi Kế toán trưởng áp dụng. |

Tham khảo [Luồng nhập Excel của MISA AMIS](https://helpact.misa.vn/kb/html_10050000/) và [Phạm vi khai báo số đầu kỳ](https://helpact.misa.vn/kb/khai-bao-so-du-ban-dau/). Ledo hiện dùng cột cố định theo mẫu. Ghép cột tự do, số dư ngoại tệ, tồn theo kho/lô và chuyển kỳ là các phần chưa triển khai.

## Nhập và đối chiếu sao kê ngân hàng

Mở **Nghiệp vụ → Đối chiếu ngân hàng → Nhập sao kê**. Ledo dùng một sổ sao kê NH01 cho mỗi chi nhánh trong kỳ đang mở. Kế toán và Kế toán trưởng nhập dữ liệu theo quyền của chi nhánh. Khi kỳ khóa hoặc còn bản số dư đầu kỳ chờ áp dụng, hệ thống chặn nhập mới.

| Bước | Cách sử dụng |
|---|---|
| Chuẩn bị tệp | Tải mẫu Excel hoặc CSV UTF-8. Giữ nguyên sáu cột của mẫu. Cả tiền vào lẫn tiền ra có thể nằm trong cùng tệp, nhưng mỗi giao dịch chỉ điền một chiều. Mã giữ dạng văn bản để bảo toàn số 0 đầu. |
| Kiểm tra dữ liệu | Ledo hiển thị các dòng mới, dòng đã có và dòng cần xử lý. Nếu mã đối tác thiếu, có thể chọn trên bảng xem trước theo nhóm khách hàng hoặc nhà cung cấp và ngày hiệu lực. Ngày chấp nhận ô Excel, dạng `dd/MM/yyyy` hoặc `yyyy-mm-dd`. |
| Lưu đợt nhập | Một tệp tối đa 25 giao dịch và 2 MB. Mã trùng nguyên vẹn được bỏ qua. Nếu cùng mã nhưng khác số tiền, ngày, chiều, đối tác hoặc nội dung, Ledo chặn cả lần nhập và giữ dữ liệu hiện tại. Các dòng mới cùng nhận một mã đợt nhập. |
| Đối chiếu | Lọc theo đợt nhập, trạng thái, chiều tiền hoặc tìm theo mã, đối tác và nội dung. Ghép với phiếu đã ghi khi cùng ngày, đối tác, số tiền và chiều tiền. Ghép phiếu có sẵn không đổi sổ. |
| Ghi khoản mới | Nếu chưa có phiếu phù hợp, mở công nợ để gửi phương án. Ở bản vận hành, Kế toán trưởng xử lý dựa trên đề xuất khớp từ người khác. Ledo hiển thị tác động lên tiền gửi và công nợ trước khi ghi. |

Tham khảo [Nhập sao kê từ Excel của MISA AMIS](https://helpact.misa.vn/kb/lam-the-nao-de-nhap-khau-sao-ke-ngan-hang-vao-phan-mem/) và [Đối chiếu ngân hàng của MISA AMIS](https://helpact.misa.vn/kb/doichieunganhang/). Ledo hỗ trợ nhập theo mẫu cố định và quy trình đối chiếu nội bộ. Kết nối trực tiếp ngân hàng, nhiều tài khoản ngân hàng và tự động ghép toàn bộ nằm ngoài phạm vi hiện tại.

### Đối chiếu số dư cuối ngày

Chọn **Đối chiếu số dư** trong phân hệ ngân hàng. Đặt ngày đối chiếu trong kỳ hoặc chọn một mốc đã lưu. Nhập số dư đóng ngày từ sổ phụ để so với số dư theo **TK 112 = số dư đầu kỳ + phát sinh Nợ − phát sinh Có** đến hết ngày xem. Có thể lưu nguồn số dư, chẳng hạn mã sổ phụ, cùng người và thời điểm lưu.

| Khoản mục | Cách đọc |
|---|---|
| Chênh lệch ban đầu | Số dư ngân hàng trừ số dư sổ kế toán. |
| Phần giải thích được | Biến động ròng của dòng sao kê chưa ghép trừ biến động ròng của phiếu đã ghi chưa ghép. Tiền vào mang dấu cộng và tiền ra mang dấu trừ. |
| Chênh lệch còn lại | Chênh lệch ban đầu trừ phần giải thích được. Bấm mã phiếu để xem bút toán hoặc bấm **Xem đối chiếu** để xử lý dòng sao kê. |
| Mốc đã lưu | Lưu số dư sổ phụ để tra lại theo chi nhánh và ngày. Số liệu kế toán được tính lại theo sổ hiện tại nếu có thêm chứng từ hoặc thay đổi liên kết. |

Ví dụ sổ kế toán còn 320.000 đồng và sổ phụ còn 340.000 đồng. Sao kê có một khoản chi chưa ghép 10.000 đồng, sổ có phiếu chi chưa ghép 30.000 đồng. Chênh lệch 20.000 đồng bằng tác động ròng của hai nhóm, còn lại 0 đồng. Hai dòng vẫn xuất hiện để kế toán tiếp tục đối chiếu. Lưu mốc không tạo bút toán. Kỳ đã khóa cho phép xem nhưng chặn sửa mốc.

## Công nợ và tuổi nợ

Mở **Nghiệp vụ → Công nợ**. Mặc định báo cáo lấy đến cuối kỳ đang mở. Đổi **Ngày đối chiếu** và bấm **Xem số dư** để xem số liệu tại một ngày trong kỳ. Kế toán và Kế toán trưởng xem chứng từ, mở phiếu thu/chi theo quyền đã cấp. Khi khóa kỳ, vẫn có thể xem và xuất báo cáo.

| Nội dung | Cách sử dụng |
|---|---|
| Hạn thanh toán | Điền ở đơn mua/bán, kể cả hạn sau kỳ hiện tại. Ledo mang hạn từ đơn qua chứng từ ghi sổ. Số dư đầu kỳ dùng hạn từ bảng khai ban đầu. |
| Bảng tuổi nợ | Chọn Phải thu hoặc Phải trả. Biểu đồ chia quá hạn 1–30, 31–60, 61–90, 91–120 và trên 120 ngày, cùng các nhóm còn trong hạn và chưa có hạn. Nhóm 0–7 ngày gồm cả ngày đến hạn. Bấm một nhóm để lọc bảng. |
| Đối chiếu chứng từ | Lọc theo đối tác, mã, tình trạng và sắp xếp. Mở một chứng từ để xem số ban đầu, số đã phân bổ, số còn lại, hạn và từng phiếu thanh toán đã ghi sổ đến ngày chọn. |
| Đối chiếu theo đối tác | Xem tổng phải thu, phải trả và số quá hạn từng đối tác. Bấm tên để mở các chứng từ tương ứng. |
| Thu hoặc chi | Từ hồ sơ công nợ, tạo phiếu đã chọn sẵn chứng từ gốc. Số tiền tối đa căn cứ số còn lại theo sổ hiện tại. Phiếu đi qua luồng lưu nháp, duyệt và ghi sổ. |
| Xuất dữ liệu | Xuất toàn bộ chứng từ phù hợp bộ lọc ra CSV UTF-8, gồm chi nhánh, ngày đối chiếu, hạn và số tiền VND. |

Ví dụ, một khoản đầu kỳ còn 900.000 đồng và có phiếu thu 300.000 đồng hạch toán ngày 12. Báo cáo ngày 11 hiển thị 900.000 đồng, báo cáo ngày 12 hiển thị 600.000 đồng. Phiếu nháp hoặc phiếu đã duyệt chưa làm thay đổi số trên báo cáo. Khoản thiếu hạn được xếp riêng.

Tham khảo [Chi tiết công nợ phải thu theo tuổi nợ của MISA AMIS](https://helpact.misa.vn/kb/bao-cao-cong-no-khach-hang/) và [đối chiếu số dư với báo cáo tuổi nợ](https://helpact.misa.vn/kb/lam-the-nao-khi-tong-so-con-phai-thu-phai-tra-tren-bao-cao-tong-hop-cong-no-phai-thuphai-tra-len-khong-khop-bao-cao-phan-tich-cong-no-phai-thu-phai-tra-theo-tuoi-no/). Ledo hiện dùng khoảng tuổi nợ cố định và xem từng chi nhánh trong kỳ đang mở.

## Tổng quan tài chính

- **Lãnh đạo** xem số tổng hợp theo chi nhánh được cấp. **Kế toán trưởng** có thể chọn khoảng trên biểu đồ và mở chứng từ nguồn đã ghi sổ. Các vai trò khác tiếp tục theo các quyền sẵn có.
- Biểu đồ hiển thị theo ngày hoặc nhóm 7 ngày trong kỳ đang mở. Chọn **Kinh doanh** để xem doanh thu và giá vốn, hoặc **Dòng tiền** để xem tiền vào, tiền ra. Bảng số liệu bên dưới biểu đồ luôn ghi đầy đủ số tiền theo VND.
- Lãi gộp bằng doanh thu trừ giá vốn. Lưu chuyển tiền thuần bằng tiền vào trừ tiền ra. Tổng hợp lấy giao dịch đã ghi sổ và số đầu kỳ khi có. Công nợ trình bày phần đã đối trừ và số còn lại. Vai trò được cấp quyền Công nợ có thể mở bảng phân tích tuổi nợ từ đây.
- Chọn một cột thời gian để lọc phần **Đối chiếu phát sinh** và **Chứng từ đã ghi sổ**. Thẻ đầu trang, công nợ và tồn kho luôn hiển thị số toàn kỳ.

## Cấu trúc và kiểm thử

| Thư mục | Nội dung |
| --- | --- |
| `frontend/` | Giao diện React và các màn hình nghiệp vụ. |
| `backend/modules/` | Phân quyền, chứng từ, sổ, kho và công nợ. |
| `backend/standalone/` | Đăng nhập và schema tài khoản local. |
| `backend/api/` | API dùng chung cho bản local và bản mẫu. |
| `drizzle/` | Migration dữ liệu nghiệp vụ. |
| `scripts/` | Entry point local, bản mẫu và công cụ build. |
| `tests/integration/` | Kiểm thử API, luồng chứng từ, quyền và khởi động lại. |

```sh
npm run build
npm test
```
