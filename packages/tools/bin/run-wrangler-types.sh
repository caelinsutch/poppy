#!/bin/sh
set -eu

exec wrangler types --env-file=.env
