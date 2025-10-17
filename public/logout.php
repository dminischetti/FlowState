<?php

declare(strict_types=1);

?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Logging out…</title>
    <meta http-equiv="refresh" content="1;url=login.php">
</head>
<body>
<script src="assets/js/api.js"></script>
<script>
(async function () {
    try {
        await window.FlowStateApi.logout();
    } catch (err) {
        console.error(err);
    }
    window.location.href = 'login.php';
}());
</script>
</body>
</html>
