<h3><%= header %> <small class="sortby-selector hide js-sortby-selector">сортировать по <div class="btn-group"><button class="btn btn-small dropdown-toggle" data-toggle="dropdown"><span class="value js-selected"></span><span class="caret"></span></button><ul class="dropdown-menu"></ul></div></small>
<small class="sortby-power hide js-sortby-power">
    <div class="checkbox" style="display:inline-block;">
        <label>
            <input class="js-sortby-powerCheckbox" type="checkbox"> Мощность
        </label>
    </div>
</small>
</h3>
<ul class="nav nav-pills">
<% _.each(r,function(item){%>
	<li data-val="<%=item %>" class="<%= _.find(warnings,function(w){ return w==item;}) ? "label-warning":"" %>"><a href="<%= link(item) %>"><%= item?item:"{всё}" %></a></li>
<% }) %>
</ul>
