import { app } from './app'

const port = 3000

app.listen(port, () => {
  console.log(`stac-server listening on port ${port}`)
})
