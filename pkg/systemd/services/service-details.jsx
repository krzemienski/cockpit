/*
 * This file is part of Cockpit.
 *
 * Copyright (C) 2019 Red Hat, Inc.
 *
 * Cockpit is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * Cockpit is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Cockpit; If not, see <http://www.gnu.org/licenses/>.
 */

import React from "react";
import moment from "moment";
import PropTypes from "prop-types";
import { Alert, Button, Tooltip, TooltipPosition } from "@patternfly/react-core";
import { Modal, DropdownKebab, MenuItem } from 'patternfly-react';

import cockpit from "cockpit";
import { OnOffSwitch } from "cockpit-components-onoff.jsx";
import { systemd_client, SD_MANAGER, SD_OBJ } from "./services.jsx";

import './service-details.scss';

const _ = cockpit.gettext;

/*
 * React template for instantiating service templates
 * Required props:
 *  - template:
 *      Name of the template
 *  - instantiateCallback
 *      Method for calling unit file methods like `EnableUnitFiles`
 */
export class ServiceTemplate extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            inputText: "",
            error: undefined,
            instantiateInProgress: false,
        };
        this.handleChange = this.handleChange.bind(this);
        this.unitInstantiate = this.unitInstantiate.bind(this);
    }

    handleChange(e) {
        this.setState({ inputText: e.target.value });
    }

    /* See systemd-escape(1), used for instantiating templates.
     */
    systemd_escape(str) {
        function name_esc(str) {
            var validchars = /[0-9a-zA-Z:-_.\\]/;
            var res = "";
            var i;

            for (i = 0; i < str.length; i++) {
                var c = str[i];
                if (c == "/")
                    res += "-";
                else if (c == "-" || c == "\\" || !validchars.test(c)) {
                    res += "\\x";
                    var h = c.charCodeAt(0).toString(16);
                    while (h.length < 2)
                        h = "0" + h;
                    res += h;
                } else
                    res += c;
            }
            return res;
        }

        function kill_slashes(str) {
            str = str.replace(/\/+/g, "/");
            if (str.length > 1)
                str = str.replace(/\/$/, "").replace(/^\//, "");
            return str;
        }

        function path_esc(str) {
            str = kill_slashes(str);
            if (str == "/")
                return "-";
            else
                return name_esc(str);
        }

        if (str.length > 0 && str[0] == "/")
            return path_esc(str);
        else
            return name_esc(str);
    }

    unitInstantiate(param) {
        const cur_unit_id = this.props.template;

        if (cur_unit_id) {
            const tp = cur_unit_id.indexOf("@");
            const sp = cur_unit_id.lastIndexOf(".");
            if (tp != -1) {
                let s = cur_unit_id.substring(0, tp + 1);
                s = s + this.systemd_escape(param);
                if (sp != -1)
                    s = s + cur_unit_id.substring(sp);

                this.setState({ instantiateInProgress: true });
                systemd_client.call(SD_OBJ, SD_MANAGER, "StartUnit", [s, "fail"])
                        .then(() => setTimeout(() => cockpit.location.go([s]), 2000))
                        .catch(error => this.setState({ error: error.toString(), instantiateInProgress: false }));
            }
        }
    }

    render() {
        return (
            <>
                {this.state.error && <Alert variant="danger" isInline title={this.state.error} />}
                <div className="panel panel-default">
                    <div className="list-group">
                        <div className="list-group-item">
                            { cockpit.format(_("$0 Template"), this.props.template) }
                        </div>
                        <div className="list-group-item">
                            <input type="text" onChange={ this.handleChange } />
                        </div>
                        <div className="list-group-item">
                            <Button variant="primary" isDisabled={this.state.instantiateInProgress} onClick={() => this.unitInstantiate(this.state.inputText)}>{ _("Instantiate") }</Button>
                            {this.state.instantiateInProgress && <div className="spinner spinner-sm pull-right" />}
                        </div>
                    </div>
                </div>
            </>
        );
    }
}
ServiceTemplate.propTypes = {
    template: PropTypes.string.isRequired,
};
/*
 * Note:
<p translate="yes">This unit is not designed to be enabled explicitly.</p>
    Error:
    error.toString()
*/

/*
 * React template for showing basic dialog for confirming action
 * Required props:
 *  - title
 *     Title of the dialog
 *  - message
 *     Message in the dialog
 *  - close
 *     Action to be executed when Cancel button is selected.
 * Optional props:
 *  - confirmText
 *     Text of the button for confirming the action
 *  - confirmAction
 *     Action to be executed when the action is confirmed
 */
class ServiceConfirmDialog extends React.Component {
    render() {
        return (
            <Modal id={this.props.id} show>
                <Modal.Header>
                    <Modal.Title>{this.props.title}</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    {this.props.message}
                </Modal.Body>
                <Modal.Footer>
                    { this.props.confirmText && this.props.confirmAction &&
                        <Button variant='danger' onClick={this.props.confirmAction}>
                            {this.props.confirmText}
                        </Button>
                    }
                    <Button variant='link' className='btn-cancel' onClick={this.props.close}>
                        { _("Cancel") }
                    </Button>
                </Modal.Footer>
            </Modal>
        );
    }
}
ServiceConfirmDialog.propTypes = {
    title: PropTypes.string.isRequired,
    message: PropTypes.string.isRequired,
    close: PropTypes.func.isRequired,
    confirmText: PropTypes.string,
    confirmAction: PropTypes.func,
};

/*
 * React template for showing possible service action (in a kebab menu)
 * Required props:
 *  - masked
 *     Unit is masked
 *  - active
 *     Unit is active (running)
 *  - failed
 *     Unit has failed
 *  - canReload
 *      Unit can be reloaded
 *  - actionCallback
 *      Method for calling unit methods like `UnitStart`
 *  - fileActionCallback
 *      Method for calling unit file methods like `EnableUnitFiles`
 *  - disabled
 *      Button is disabled
 */
class ServiceActions extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            dialogMaskedOpened: false,
        };
    }

    render() {
        const actions = [];

        // If masked, only show unmasking and nothing else
        if (this.props.masked) {
            actions.push(
                <MenuItem key="unmask" onClick={() => this.props.fileActionCallback("UnmaskUnitFiles", undefined)}>{ _("Allow running (unmask)") }</MenuItem>
            );
        } else { // All cases when not masked
            if (this.props.active) {
                if (this.props.canReload) {
                    actions.push(
                        <MenuItem key="reload" onClick={() => this.props.actionCallback("ReloadUnit")}>{ _("Reload") }</MenuItem>
                    );
                }
                actions.push(
                    <MenuItem key="restart" onClick={() => this.props.actionCallback("RestartUnit")}>{ _("Restart") }</MenuItem>
                );
                actions.push(
                    <MenuItem key="stop" onClick={() => this.props.actionCallback("StopUnit")}>{ _("Stop") }</MenuItem>,
                );
            } else {
                actions.push(
                    <MenuItem key="start" onClick={() => this.props.actionCallback("StartUnit")}>{ _("Start") }</MenuItem>
                );
            }

            if (actions.length > 0) {
                actions.push(
                    <MenuItem key="divider2" divider />
                );
            }

            if (this.props.failed)
                actions.push(
                    <MenuItem key="reset" onClick={() => this.props.actionCallback("ResetFailedUnit", []) }>{ _("Clear 'Failed to start'") }</MenuItem>
                );

            actions.push(
                <MenuItem key="mask" onClick={() => this.setState({ dialogMaskedOpened: true }) }>{ _("Disallow running (mask)") }</MenuItem>
            );
        }

        return (
            <>
                { this.state.dialogMaskedOpened &&
                    <ServiceConfirmDialog id="mask-service" title={ _("Mask Service") }
                                          message={ _("Masking service prevents all dependent units from running. This can have bigger impact than anticipated. Please confirm that you want to mask this unit.")}
                                          close={() => this.setState({ dialogMaskedOpened: false }) }
                                          confirmText={ _("Mask Service") }
                                          confirmAction={() => {
                                              this.props.fileActionCallback("MaskUnitFiles", false);
                                              this.props.actionCallback("ResetFailedUnit", []);
                                              this.setState({ dialogMaskedOpened: false });
                                          }} />
                }
                {/* DropdownKebab has no disabled prop, see #13552 */}
                <DropdownKebab id="service-actions" title={ _("Additional actions") } className={this.props.disabled ? "disabled" : "" }>
                    {actions}
                </DropdownKebab>
            </>
        );
    }
}
ServiceActions.propTypes = {
    masked: PropTypes.bool.isRequired,
    active: PropTypes.bool.isRequired,
    failed: PropTypes.bool.isRequired,
    canReload: PropTypes.bool,
    actionCallback: PropTypes.func.isRequired,
    fileActionCallback: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};

/*
 * React template for a service details
 * Shows current status and information about the service.
 * Enables user to control this unit like starting, enabling, etc. the service.
 * Required props:
 *  -  unit
 *      Unit as returned from systemd dbus API
 *  -  permitted
 *      True if user can control this unit
 *  -  systemdManager
 *      Callback for displaying errors
 *  -  isValid
 *      Method for finding if unit is valid
 * Optional props:
 *  -  originTemplate
 *      Template name, from which this unit has been initialized
 */
export class ServiceDetails extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            waitsAction: false,
            waitsFileAction: false,
            note: "",
            error: "",
        };

        this.onOnOffSwitch = this.onOnOffSwitch.bind(this);
        this.unitAction = this.unitAction.bind(this);
        this.unitFileAction = this.unitFileAction.bind(this);
    }

    shouldComponentUpdate(nextProps, nextState) {
        // Don't update when only actions resolved, wait until API triggers some redrawing
        if ((nextState.waitsAction === false && this.state.waitsAction === true) ||
            (nextState.waitsFileAction === false && this.state.waitsFileAction === true) ||
            nextProps.loadingUnits)
            return false;
        return true;
    }

    onOnOffSwitch() {
        if (this.props.unit.UnitFileState === "enabled") {
            this.unitFileAction("DisableUnitFiles", undefined);
            if (this.props.unit.ActiveState === "active" || this.props.unit.ActiveState === "activating")
                this.unitAction("StopUnit");
            if (this.props.unit.ActiveState === "failed")
                this.unitAction("ResetFailedUnit", []);
        } else {
            this.unitFileAction("EnableUnitFiles", false);
            if (this.props.unit.ActiveState !== "active" && this.props.unit.ActiveState !== "activating")
                this.unitAction("StartUnit");
        }
    }

    unitAction(method, extra_args) {
        if (extra_args === undefined)
            extra_args = ["fail"];
        this.setState({ waitsAction: true });
        systemd_client.call(SD_OBJ, SD_MANAGER, method, [this.props.unit.Names[0]].concat(extra_args))
                .catch(error => this.setState({ error: error.toString() }))
                .finally(() => this.setState({ waitsAction: false }));
    }

    unitFileAction(method, force) {
        this.setState({ waitsFileAction: true });
        const args = [[this.props.unit.Names[0]], false];
        if (force !== undefined)
            args.push(force == "true");
        systemd_client.call(SD_OBJ, SD_MANAGER, method, args)
                .then(([results]) => {
                    if (results.length == 2 && !results[0])
                        this.setState({ note:_("This unit is not designed to be enabled explicitly.") });
                    /* Executing daemon reload after file operations is necessary -
                     * see https://github.com/systemd/systemd/blob/master/src/systemctl/systemctl.c [enable_unit function]
                     */
                    systemd_client.call(SD_OBJ, SD_MANAGER, "Reload", null)
                            .then(() => this.setState({ waitsFileAction: false }));
                })
                .catch(error => {
                    this.setState({
                        error: error.toString(),
                        waitsFileAction: false
                    });
                });
    }

    render() {
        const active = this.props.unit.ActiveState === "active" || this.props.unit.ActiveState === "activating";
        const enabled = this.props.unit.UnitFileState === "enabled";
        const isStatic = this.props.unit.UnitFileState !== "disabled" && !enabled;
        const failed = this.props.unit.ActiveState === "failed";
        const masked = this.props.unit.LoadState === "masked";

        let status = [];

        if (masked) {
            status.push(
                <div key="masked" className="status-masked">
                    <span className="fa fa-ban status-icon" />
                    <span className="status">{ _("Masked") }</span>
                    <span className="side-note font-xs">{ _("Forbidden from running") }</span>
                </div>
            );
        }

        if (!enabled && !active && !masked && !isStatic) {
            status.push(
                <div key="disabled" className="status-disabled">
                    <span className="pficon pficon-off status-icon" />
                    <span className="status">{ _("Disabled") }</span>
                </div>
            );
        }

        if (failed) {
            status.push(
                <div key="failed" className="status-failed">
                    <span className="pficon pficon-error-circle-o status-icon" />
                    <span className="status">{ _("Failed to start") }</span>
                    { this.props.permitted &&
                        <Button variant="secondary" className="action-button" onClick={() => this.unitAction("StartUnit") }>{ _("Start Service") }</Button>
                    }
                </div>
            );
        }

        if (!status.length) {
            if (active) {
                status.push(
                    <div key="running" className="status-running">
                        <span className="pficon pficon-on-running status-icon" />
                        <span className="status">{ _("Running") }</span>
                        <span className="side-note font-xs">{ _("Active since ") + moment(this.props.unit.ActiveEnterTimestamp / 1000).format('LLL') }</span>
                    </div>
                );
            } else {
                status.push(
                    <div key="stopped" className="status-stopped">
                        <span className="pficon pficon-off status-icon" />
                        <span className="status">{ _("Not running") }</span>
                    </div>
                );
            }
        }

        if (isStatic && !masked) {
            status.unshift(
                <div key="static" className="status-static">
                    <span className="pficon pficon-asleep status-icon" />
                    <span className="status">{ _("Static") }</span>
                    { this.props.unit.WantedBy && this.props.unit.WantedBy.length > 0 &&
                        <>
                            <span className="side-note font-xs">{ _("Required by ") }</span>
                            <ul className="comma-list">
                                {this.props.unit.WantedBy.map(unit => <li className="font-xs" key={unit}><a href={"#/" + unit}>{unit}</a></li>)}
                            </ul>
                        </>
                    }
                </div>
            );
        }

        if (!this.props.permitted) {
            status.unshift(
                <div key="readonly" className="status-readonly">
                    <span className="fa fa-user status-icon" />
                    <span className="status">{ _("Read-only") }</span>
                    <span className="side-note font-xs">{ _("Requires administration access to edit") }</span>
                </div>
            );
        }

        if (enabled) {
            status.push(
                <div key="enabled" className="status-enabled">
                    <span className="pficon pficon-ok status-icon" />
                    <span className="status">{ _("Automatically starts") }</span>
                </div>
            );
        }

        /* If there is some ongoing action just show spinner */
        if (this.state.waitsAction || this.state.waitsFileAction) {
            status = [
                <div key="updating" className="status-updating">
                    <span className="spinner spinner-inline spinner-xs status-icon" />
                    <span className="status">{ _("Updating status...") }</span>
                </div>
            ];
        }

        const tooltipMessage = enabled ? _("Stop and Disable") : _("Start and Enable");
        const hasLoadError = this.props.unit.LoadState !== "loaded" && this.props.unit.LoadState !== "masked";
        const loadError = this.props.unit.LoadError ? this.props.unit.LoadError[1] : null;
        const relationships = [
            { Name: _("Requires"), Units: this.props.unit.Requires },
            { Name: _("Requisite"), Units: this.props.unit.Requisite },
            { Name: _("Wants"), Units: this.props.unit.Wants },
            { Name: _("Binds To"), Units: this.props.unit.BindsTo },
            { Name: _("Part Of"), Units: this.props.unit.PartOf },
            { Name: _("Required By"), Units: this.props.unit.RequiredBy },
            { Name: _("Requisite Of"), Units: this.props.unit.RequisiteOf },
            { Name: _("Wanted By"), Units: this.props.unit.WantedBy },
            { Name: _("Bound By"), Units: this.props.unit.BoundBy },
            { Name: _("Consists Of"), Units: this.props.unit.ConsistsOf },
            { Name: _("Conflicts"), Units: this.props.unit.Conflicts },
            { Name: _("Conflicted By"), Units: this.props.unit.ConflictedBy },
            { Name: _("Before"), Units: this.props.unit.Before },
            { Name: _("After"), Units: this.props.unit.After },
            { Name: _("On Failure"), Units: this.props.unit.OnFailure },
            { Name: _("Triggers"), Units: this.props.unit.Triggers },
            { Name: _("Triggered By"), Units: this.props.unit.TriggeredBy },
            { Name: _("Propagates Reload To"), Units: this.props.unit.PropagatesReloadTo },
            { Name: _("Reload Propagated From"), Units: this.props.unit.ReloadPropagatedFrom },
            { Name: _("Joins Namespace Of"), Units: this.props.unit.JoinsNamespaceOf }
        ];

        const conditions = this.props.unit.Conditions;
        const notMetConditions = [];
        if (conditions)
            conditions.map(condition => {
                if (condition[4] < 0)
                    notMetConditions.push(cockpit.format(_("Condition $0=$1 was not met"), condition[0], condition[3]));
            });

        return (
            <>
                { (this.state.note || this.state.error) &&
                    <ServiceConfirmDialog title={ this.state.error ? _("Error") : _("Note") }
                                          message={ this.state.error || this.state.note }
                                          close={ () => this.setState(this.state.error ? { error:"" } : { note:"" }) }
                    />
                }
                { (hasLoadError && this.props.unit.LoadState)
                    ? <Alert variant="danger" isInline title={this.props.unit.LoadState}>
                        {loadError}
                    </Alert>
                    : <>
                        <div className="service-top-panel">
                            <h2 className="service-name">{this.props.unit.Description}</h2>
                            { this.props.permitted &&
                                <>
                                    { !masked && !isStatic &&
                                        <Tooltip id="switch-unit-state" content={tooltipMessage} position={TooltipPosition.right}>
                                            <span>
                                                <OnOffSwitch state={enabled} disabled={this.state.waitsAction || this.state.waitsFileAction} onChange={this.onOnOffSwitch} />
                                            </span>
                                        </Tooltip>
                                    }
                                    <ServiceActions { ...{ active, failed, enabled, masked } } canReload={this.props.unit.CanReload} actionCallback={this.unitAction} fileActionCallback={this.unitFileAction} disabled={this.state.waitsAction || this.state.waitsFileAction} />
                                </>
                            }
                        </div>
                        <form className="ct-form">
                            <label className="control-label" htmlFor="statuses">{ _("Status") }</label>
                            <div id="statuses" className="ct-validation-wrapper">
                                { status }
                            </div>
                            <hr />
                            <label className="control-label" htmlFor="path">{ _("Path") }</label>
                            <span id="path">{this.props.unit.FragmentPath}</span>
                            <hr />
                            { this.props.originTemplate && this.props.isValid(this.props.originTemplate) &&
                                <>
                                    <div />
                                    <span>{_("Instance of template: ")}<a href={"#/" + this.props.originTemplate}>{this.props.originTemplate}</a></span>
                                </>
                            }
                            { notMetConditions.length > 0 &&
                                <>
                                    <label className="control-label failed" htmlFor="condition">{ _("Condition failed") }</label>
                                    <div id="condition" className="ct-validation-wrapper">
                                        {notMetConditions.map(cond => <div key={cond.split(' ').join('')}>{cond}</div>)}
                                    </div>
                                </>
                            }
                            <hr />
                            {relationships.map(rel =>
                                rel.Units && rel.Units.length > 0 &&
                                    <React.Fragment key={rel.Name.split().join("")}>
                                        <label className="control-label closer-lines" htmlFor={rel.Name}>{rel.Name}</label>
                                        <ul id={rel.Name.split(" ").join("")} className="comma-list closer-lines">
                                            {rel.Units.map(unit => <li key={unit}><a href={"#/" + unit} className={this.props.isValid(unit) ? "" : "disabled"}>{unit}</a></li>)}
                                        </ul>
                                    </React.Fragment>
                            )}
                        </form>
                    </>
                }
            </>
        );
    }
}
ServiceDetails.propTypes = {
    unit: PropTypes.object.isRequired,
    originTemplate: PropTypes.string,
    permitted: PropTypes.bool.isRequired,
    isValid: PropTypes.func.isRequired,
};
