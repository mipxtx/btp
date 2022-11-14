<!DOCTYPE html>
<html lang="en">
<head>
	<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
	<meta charset="utf-8">
	<?php $v = 7; $conf=file_exists('conf_path')?file_get_contents('conf_path'):""; ?>
	<title>BTP</title>
	<link rel="stylesheet" href="css/bootstrap.min.css" type="text/css">
	<link rel="stylesheet" href="css/bootstrap-responsive.min.css" type="text/css">
	<link rel="stylesheet" href="css/main.css" type="text/css">

	<script src="js/jquery-2.0.3.min.js"></script>
	<script src="js/jquery.flot.min.js"></script>
	<script src="js/jquery.flot.time.min.js"></script>
	<script src="js/jquery.flot.selection.min.js"></script>
	<script src="js/jquery.flot.crosshair.min.js"></script>
	<script src="js/bootstrap.min.js"></script>
	<script src="js/underscore-min.js"></script>
	<script src="js/backbone-min.js"></script>
	<script src="js/date.format.js"></script>

	<script src="dygraph/dygraph-combined.js?v=<?=$v?>"></script>
	<script src="dygraph/graph.js?v=<?=$v?>"></script>

	<script src="js/paralleler.js?v=<?=$v?>"></script>
	<script src="js/controllers.js?v=<?=$v?>"></script>
	<script src="<?=$conf?>config.js?v=<?=$v?>"></script>
	<script src="js/main.js?v=<?=$v?>"></script>
	<script src="<?=$conf?>dashboards.js?v=<?=$v?>"></script>
</head>
<body>

	<div class="xnavbar">
		<div class="xnavbar-inner">
			<div class="container subnav">
				<ul class="nav nav-pills">
					<li class="reset-list"><a href="#" class="js-reset-list"><i class="icon-fire"></i></a></li>
					<li data-type="service" class="js-mainmenu"><a href="#service/">Сервисы</a></li>
					<li data-type="script" class="js-mainmenu"><a href="#script/">Скрипты</a></li>
					<li data-type="dashboard" class="js-mainmenu"><a href="#dashboard/">Дашборды</a></li>
					<li class="js-mainmenu"><a href="http://tv.stat1.lan/?noslide">Мониторинг</a></li>
					<li class="mid-err empty"><a href="#" class="js-errors"><i class="icon-warning-sign"></i>Ошибки <b>0</b></a></li>
					<li class="fl-r"><a href="#" class="js-reload"><i class="icon-repeat"></i></a></li>
					<li class="fl-r js-selector dropdown" data-type="HostGroup">
						<a href="#" class="dropdown-toggle" data-toggle="dropdown">Сервер: <span></span><b class="caret"></b></a>
						<ul class="dropdown-menu" id="serverlist">
						</ul>
					</li>
			 		<li class="fl-r js-selector dropdown" data-type="Scale">
						<a href="#" class="dropdown-toggle" data-toggle="dropdown">Масштаб <span></span><b class="caret"></b></a>
						<ul class="dropdown-menu">
							<li><a href="#" data-value="5">5 секунд</a></li>
							<li><a href="#" data-value="60">1 минута</a></li>
							<li><a href="#" data-value="420">7 минут</a></li>
							<li><a href="#" data-value="3600">1 час</a></li>
							<li><a href="#" data-value="86400">1 день</a></li>
						</ul>
					</li>
					<li class="fl-r js-selector dropdown" data-type="Graph">
						<a href="#" class="dropdown-toggle" data-toggle="dropdown">Графики <span></span><b class="caret"></b></a>
						<ul class="dropdown-menu">
							<li><a href="#" data-value="dygraph">dygraph</a></li>
							<li><a href="#" data-value="flot">flot</a></li>
						</ul>
					</li>
				</ul>
			</div>
		</div>
	</div>
	
	<?php foreach (glob("templates/*.tpl") as $file) { $name = str_replace(array("templates/",".tpl"),array("","_tpl"),$file); ?>
	<script id="<?php echo $name;?>" type="text/html">
	<?php echo file_get_contents($file);?>
	</script>
	<?php }?>

	<div id="content"></div>

	<div class="modal error-list" id="errorList">
		<div class="modal-body js-error-list">
		</div>
	</div>

	<div class="modal" id="loader">
		<div class="modal-body">
			<div class="text-center">
				Подождите, идёт загрузка.
			</div>
		</div>
	</div>

</body>
</html>
