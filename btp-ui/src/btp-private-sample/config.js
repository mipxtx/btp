App.hostConfig = {
    cluster: {
        default: 'production',
        types: {
            production: 'production',
        }
    },
    scale: {
        default: '5',
        types: [
            '5', // 5 секунд
            '60', // 1 минута
            '420', // 7 минут
            '3600', // 1 час
            '86400' // 1 день
        ]
    },
    cacheTTL: 0
};

App.groupConfig = {
    'services': [
        {
            title: 'AppsFlyer',
            items: [ '^AppsFlyer_.+' ],
            replace: 'AppsFlyer_'
        }
    ]
};