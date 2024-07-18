$(".res-btn").click(function (){
    $(".hidden-url").attr("value",this.id);
    $(".searchForm").submit();
})