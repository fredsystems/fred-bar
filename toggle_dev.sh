#!/usr/bin/env bash

# see if systemd unit fredbar is running. If it is, stop it
if systemctl is-active --quiet --user fredbar; then
    systemctl stop --user fredbar
else
    systemctl start --user fredbar
fi
