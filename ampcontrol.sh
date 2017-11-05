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
command="/usr/sbin/daemon"
pidfile="/var/run/${name}.pid"
start_cmd="ampcontrol_start"

load_rc_config "$name"
: ${ampcontrol_enable:="NO"}
: ${ampcontrol_uid:="nobody"}
: ${ampcontrol_nodejs:="/usr/local/bin/node"}
: ${ampcontrol_script:="/usr/local/bin/ampcontrol.js"}
: ${ampcontrol_host:="onkyo"}
: ${ampcontrol_port:="60128"}

ampcontrol_start()
{
	check_startmsgs && echo "Starting ${name}."

	[ -x "${ampcontrol_nodejs}" ] || { echo "Node.js binary ${ampcontrol_nodejs} not executable" >&2; exit 1; }
	[ -r "${ampcontrol_script}" ] || { echo "ampcontrol script ${ampcontrol_script} not readable" >&2; exit 1; }
	id "${ampcontrol_uid}" >/dev/null 2>&1 || { echo "No such user: ${ampcontrol_uid}" >&2; exit 1; }

	"${command}" -f -P "${pidfile}" -t "${name}" -S -T "${name}" -r \
		-u "${ampcontrol_uid}" "${ampcontrol_nodejs}" \
		"${ampcontrol_script}" "${ampcontrol_host}" "${ampcontrol_port}"
}

run_rc_command "$1"
