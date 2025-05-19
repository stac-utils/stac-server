### Initial Setup

```bash
micromamba env create -f ./environment.yaml
micromamba activate stac-server
cd ~/git/stac-server && npm install && npm install serverless-plugin-git-variables serverless-python-requirements
```

### Deploy stac-server

```bash
micromamba activate stac-server
PROFILE=test eval $(aws configure export-credentials --profile $PROFILE --format env) && cd ~/git/stac-server && npm run build && npm run deploy -- --stage $PROFILE
```
