'use strict';

var path = require('path');
var co = require('co-utils');
var glob = require('glob');
var log = require('logtopus').getLogger('co-task');
log.setLevel('warn');

class CoTasks {
    /**
     * CoTasks constructor
     *
     * conf: {
     *     tasksDir: {string} Path to tasks directory,
     *     debug: {boolean} enables debug mode
     * }
     *
     * @method constructor
     * @param  {object}    [conf] Conf object
     */
    constructor(conf) {
        conf = conf || {};

        if (conf.debug) {
            this.debug = true;
            log.setLevel('debug');
        }

        /**
         * Tasks storage
         * @type {Object}
         */
        this.tasks = {};

        /**
         * Predefined task names
         * @type {Array}
         * @default null
         */
        this.allowedTasks = null;


        if (conf && conf.tasksDir) {
            this.registerTasksDir(conf.tasksDir);
        }
    }

    /**
     * Runs tasks in series.
     * @method run
     *
     * @param {String|Array} [tasks] Task name to be run. If this is not set, all tasks will be run
     * @return {Object} Returns a promise
     */
    run(tasks, ctx, args, timeout) {
        if (!tasks) {
            tasks = this.allowedTasks;
        }
        else if (typeof tasks === 'string') {
            tasks = [tasks];
        }

        return co(function* () {
            var res = [];
            for (let task of tasks) {
                let result;

                if (!this.tasks[task]) {
                    throw new Error('Task name ' + task + ' not defined!');
                }

                if (this.tasks['pre-' + task] && this.tasks['pre-' + task].length) {
                    if (this.debug) {
                        log.debug('Run pre-' + task + ' tasks. Num items', this.tasks['pre-' + task].length);
                    }

                    result = yield co.series(this.tasks['pre-' + task], ctx, args, timeout);
                    res.push({
                        task: 'pre-' + task,
                        results: result
                    });
                }

                if (this.tasks[task] && this.tasks[task].length) {
                    if (this.debug) {
                        log.debug('Run ' + task + ' tasks. Num items', this.tasks[task].length);
                    }

                    result = yield co.series(this.tasks[task], ctx, args, timeout);
                    res.push({
                        task: task,
                        results: result
                    });
                }

                if (this.tasks['post-' + task] && this.tasks['post-' + task].length) {
                    if (this.debug) {
                        log.debug('Run post-' + task + ' tasks. Num items', this.tasks['post-' + task].length);
                    }

                    result = yield co.series(this.tasks['post-' + task], ctx, args, timeout);
                    res.push({
                        task: 'post-' + task,
                        results: result
                    });
                }

            }

            return res;
        }.bind(this));
    }

    /**
     * Runs tasks in series, pipes date trough all methods.
     * @method pipe
     *
     * @param {String|Array} [tasks] Task name to be called. If this is not set, all tasks will be called
     * @return {Object} Returns a promise
     */
    pipe(tasks, ctx, pipeArg, timeout) {
        if (typeof tasks === 'string') {
            tasks = [tasks];
        }

        if (!tasks || !Array.isArray(tasks)) {
            timeout = pipeArg;
            pipeArg = ctx;
            ctx = tasks;
            tasks = this.allowedTasks;
        }

        if (typeof pipeArg === 'number' || pipeArg === undefined) {
          pipeArg = ctx;
          ctx = null;
        }


        if (!tasks) {
           throw new Error('Set allowedTasks option or use tasks argument!');
        }

        return co(function* () {
            for (let task of tasks) {
                if (!this.tasks[task]) {
                    throw new Error('Task name ' + task + ' not defined!');
                }

                if (this.tasks['pre-' + task] && this.tasks['pre-' + task].length) {
                    if (this.debug) {
                        log.debug('Run pre-' + task + ' tasks. Num items', this.tasks['pre-' + task].length);
                    }

                    pipeArg = yield co.pipe(this.tasks['pre-' + task], ctx, pipeArg, timeout);
                    if (!pipeArg) {
                      throw new Error('Pipe error. Returned data aren\'t a valid pipe data object');
                    }
                }

                if (this.tasks[task] && this.tasks[task].length) {
                    if (this.debug) {
                        log.debug('Run ' + task + ' tasks. Num items', this.tasks[task].length);
                    }

                    pipeArg = yield co.pipe(this.tasks[task], ctx, pipeArg, timeout);
                    if (!pipeArg) {
                      throw new Error('Pipe error. Returned data aren\'t a valid pipe data object');
                    }
                }

                if (this.tasks['post-' + task] && this.tasks['post-' + task].length) {
                    if (this.debug) {
                        log.debug('Run post-' + task + ' tasks. Num items', this.tasks['post-' + task].length);
                    }

                    pipeArg = yield co.pipe(this.tasks['post-' + task], ctx, pipeArg, timeout);
                    if (!pipeArg) {
                      throw new Error('Pipe error. Returned data aren\'t a valid pipe data object');
                    }
                }

            }

            return pipeArg;
        }.bind(this));
    }

    /**
     * Registers a task
     * @chainable
     * @method registerTask
     *
     * @param {String} name, Task name
     * @param {Function|Object} fn Task function or object.
     * @return {Object} Returns this.
     */
    registerTask(name, fn) {
        if (this.debug) {
            log.debug('Register new task', name);
        }

        if (!this.tasks[name]) {
            if (this.allowedTasks) {
                throw new Error('Task name ' + name + ' not defined!\nAllowed tasks are: ' + Object.keys(this.tasks).join(', '));
            }

            this.tasks[name] = [];
        }

        this.tasks[name].push(fn);
    }

    /**
     * Predefine task names
     *
     * @method defineTasks
     * @chainable
     *
     * @param {Array} Array of predefined tasks.
     * @return {Object} Returns this value
     */
    defineTasks(tasks, regPreTasks, regPostTasks) {
        this.allowedTasks = [];
        for (let task of tasks) {
            if (regPreTasks) {
                this.tasks['pre-' + task] = [];
            }

            if (!(task in this.tasks)) {
                this.tasks[task] = [];
            }
            this.allowedTasks.push(task);

            if (regPostTasks) {
                this.tasks['post-' + task] = [];
            }
        }
    }

    /**
     * Registers a tasks dir
     * @method registerTasksDir
     * @param {string} dir Dir name
     * @returns {object} Returns a promise
     */
    registerTasksDir(dir) {
        if (this.debug) {
            log.debug('Register tasks dir', dir);
        }

        var self = this;
        var files = glob.sync('**/*.js', {
          cwd: dir
        });

        for (let file of files) {
            if (this.debug) {
                log.debug('... load tasks file', file);
            }

            var mod = require(path.join(dir, file));
            mod(self, log);
        }
    }
}

module.exports = CoTasks;
