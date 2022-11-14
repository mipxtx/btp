<% _.each(r,function(item,key){ %>
	<% if (item.items) { var parent = item; %>
		<li class="js-parent<%= item.warning ? " label-warning":"" %>" data-val="grp<%=key%>">
			<a><b><%= item.name %></b></a>
			<% if (item.items.length) { %>
			<ul class="items nav nav-list"></ul>
			<% } %>
		</li>
	<% } else { %>
		<li data-val="<%=item.val%>" class="item<%= item.warning ? " label-warning":"" %> ">
			<a href="<%= link(item.val) %>"><%= item.name %></a>
		</li>
	<% } %>
<% }) %>