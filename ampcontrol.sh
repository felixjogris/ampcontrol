#!/bin/sh

# PROVIDE: ampcontrol
# REQUIRE: DAEMON
# KEYWORD: shutdown

# Add the following line to /etc/rc.conf to enable ampcontrol:
#
# ampcontrol_enable="YES"

. /etc/rc.subr

name="ampcontrol"
rcvar="${name}_enable"
command="/usr/local/bin/ampcontrol.js"
pidfile="/var/run/${name}.pid"
start_cmd="ampcontrol_start"

load_rc_config "$name"
: ${ampcontrol_enable:="NO"}
: ${ampcontrol_user:="nobody"}
: ${ampcontrol_host:="onkyo"}
: ${ampcontrol_port:="60128"}

ampcontrol_start()
{
	check_startmsgs && echo "Starting ${name}."
	/usr/sbin/daemon -f -p "${pidfile}" -t "${name}" -u "${ampcontrol_user}" \
    "${command}" "${ampcontrol_host}" "${ampcontrol_port}"
}

run_rc_command "$1"