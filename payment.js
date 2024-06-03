
const api_url="http://124.71.201.17:8084/api/";

window.onload=()=>{
    let total=0;
    let orders=document.getElementById("orders");
    let show_tot=document.getElementById("total");
    for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);//水果编号
        let num = localStorage.getItem(key);//数量
        fetch(api_url+"display/?num="+key).then(
            res=>res.json()
        ).then(
            data=>{
                let price=parseInt(data[2])*parseInt(num);
                orders.innerHTML+=`
                <div class="product">
                    <img src="jpg/${data[0]}.jpeg"  height="60">
                    <h4>${data[1]}</h4>
                    <p>${num}个 <span>${price}HKD</span></p>
                    <div class="but-buy" onclick="change(${key});">
                        <p>修改</p>
                    </div>
                </div>`
                total+=price;
                show_tot.innerHTML=`${total} HKD`;
            }
        );
    }
    console.log(total);
    
}
function buy(){
    // 一定要交给后端验证！
    localStorage.clear();
}

const display_page="display.html?num=";
// 不能带/不然出错
function change(num){
    window.location.href=display_page+num;
    // get方法访问display.html
}