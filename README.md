# fileshost

A simple HTTP server that serves static files

Supports multiple sub-domains

## Running

First make a `.env` file like this:

```
DOMAIN=example.com
DIR=/path/to/files
PORT=1234
```

`DOMAIN` will be where the files will be accessed across the internet

`DIR` will be the root directory of the hosted files. Each sub directory will be a sub-domain.
For example, if your `DOMAIN` is `example.com` and likewise `DIR` is set to
`/home/user/example.com`, files in the directory:

- `/home/user/example.com/@` will be hosted at example.com and www.example.com
- `/home/user/example.com/app` will be hosted at app.example.com
- `/home/user/example.com/files` will be hosted at files.example.com
- And so on...

The server will follow symlinks, so you may link a sub-domain's directory or a deeply nested dir
somewhere else

`PORT` is simply which port the server will run on

Now that the environment is set up, run using Go:

```bash
go run main.go
```
