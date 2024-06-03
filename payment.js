
// const api_url="http://124.71.201.17:8084/api/";
const api_url="http://127.0.0.1:5000/";

window.onload=()=>{
    let orders_info={};//订单信息，发给后端来验算

    let show_orders=document.getElementById("orders");
    let show_tot=document.getElementById("total");

    for (let i = 0; i < localStorage.length; i++) {
        let product_id = localStorage.key(i);//水果编号
        let data_str = localStorage.getItem(product_id);//数量

        let data = JSON.parse(data_str);
        orders_info[product_id]=data.amount;
        show_orders.innerHTML+=`
            <div class="product">
                <img src="jpg/${data.photo}.jpeg"  height="60">
                <h4>${data.name}</h4>
                <p>${data.amount}个 <span>${data.price}HKD</span></p>
                <div class="but-buy" onclick="change(${product_id});">
                    <p>修改</p>
                </div>
            </div>`;
    }

    // 总额一定要交给后端验证！
    fetch(api_url+"cart/",{
        method:"POST",
        body: JSON.stringify(orders_info),
        headers: {
            "Content-Type": "application/json",
            // 'Content-Type': 'application/x-www-form-urlencoded',
          }
    }).then(
        res=>res.json()
    ).then(
        data=>{
            show_tot.innerHTML=`${data.total} HKD`;
        }
    );   
}
function buy(){
    localStorage.clear();
}

const display_page="display.html?num=";
// 不能带/不然出错
function change(num){
    window.location.href=display_page+num;
    // get方法访问display.html
}