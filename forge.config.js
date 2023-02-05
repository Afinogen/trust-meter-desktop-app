module.exports = {
    publishers: [
        {
            name: '@electron-forge/publisher-github',
            config: {
                repository: {
                    owner: 'Afinogen',
                    name: 'trust-meter-desktop-app',
                },
                prerelease: false,
                draft: true,
            },
        },
    ],
}