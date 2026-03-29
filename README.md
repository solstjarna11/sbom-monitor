# sbom-monitor

## dev build testing
After running npm run clean, and npm run build, npm run dev/start the global sbom-monitor symlink breaks, requiring these commands:

````
npm unlink -g sbom-monitor
npm link
````