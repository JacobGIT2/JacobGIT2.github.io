// 1.从后端API获得商品条目
// 2.统计购物-localstorage

const api_url="http://127.0.0.1:5000/";

window.onload=()=>{
    let fruits=document.getElementById("fruits");
    fetch(api_url+"get_products/",{method:"POST"}).then(
        res=>res.json()
    ).then(
        data=>{
            let i=0;
            for(p of data){
                fruits.innerHTML+=`
                <div class="fruit-choice">
                    <img src="jpg/${p.photo}.jpeg" alt="">
                    <h4 class="fruit-name">${p.name}</h4>
                    <p class="price">价格 <span>￥${p.price}</span></p>
                    <div class="but-buy" onclick="jump(${i});">购买</div>
                </div>`;
                i++;
            }
        }
    );
}

const display_page="display.html?num=";
// 不能带/不然出错
function jump(num){
    window.location.href=display_page+num;
    // get方法访问display.html
}
