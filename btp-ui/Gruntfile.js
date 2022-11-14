module.exports = function (grunt) {
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        'copy': {
            'configs': {
                files: [
                    { expand: true, flatten: true, src: ['src/php/conf_path'], dest: 'www/', filter: 'isFile' },
                    { expand: true, flatten: true, src: ['src/btp-private-sample/*.js'], dest: 'www/btp-private-sample/' }
                ]
            },
            'templates': {
                files: [
                    { expand: true, flatten: true, src: ['src/templates/*'], dest: 'www/templates' }
                ]
            },
            'php': {
                files: [
                    { expand: true, flatten: true, src: ['src/php/*.php'], dest: 'www/', filter: 'isFile' },
                    { expand: true, cwd: 'src/php/', src: ['jpgraph/*'], dest: 'www/' }
                ]
            },
            'js': {
                files: [
                    { expand: true, cwd: 'src/', src: ['dygraph/*.js'], dest: 'www/', filter: 'isFile' },
                    { expand: true, cwd: 'src/scripts/', src: ['*.js'], dest: 'www/js/' }
                ]
            },
            'external': {
                files: [
                    { expand: true, cwd: 'src/external/bootstrap/css', src: ['*.min.css'], dest: 'www/css' },
                    { expand: true, cwd: 'src/external/bootstrap/img', src: ['*'], dest: 'www/img' },
                    { expand: true, cwd: 'src/external/bootstrap/js', src: ['*.min.js'], dest: 'www/js' },
                    { expand: true, cwd: 'src/external/backbone/', src: ['*-min.js'], dest: 'www/js/' },
                    { expand: true, cwd: 'src/external/jquery/', src: ['*.min.js'], dest: 'www/js/' },
                    { expand: true, cwd: 'src/external/flot/', src: ['jquery.flot.min.js', 'jquery.flot.time.min.js', 'jquery.flot.selection.min.js', 'jquery.flot.crosshair.min.js'], dest: 'www/js/' },
                    { expand: true, cwd: 'src/external/', src: ['date.format.js'], dest: 'www/js/' }
                ]
            }
        },
        'less': {
            'main': {
                options: {
                    cleancss: true
                },
                files: {
                    'www/css/main.css': 'src/less/main.less'
                }
            }
        },
        'typescript': {
            'base': {
                src: ['src/scripts/*.ts'],
                dest: 'www/js',
                options: {
                    module: 'amd', //or commonjs
                    target: 'es5', //or es3
                    basePath: 'src/scripts/',
                    sourceMap: false,
                    declaration: false
                }
            }
        },
        'uglify': {
            'www': {
                files: {
                    'www/js/main.js': ['www/js/main.js'],
                    'www/js/controllers.js': ['www/js/controllers.js']
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-copy');
    grunt.loadNpmTasks('grunt-contrib-less');
    grunt.loadNpmTasks('grunt-typescript');
    grunt.loadNpmTasks('grunt-contrib-uglify');

    grunt.registerTask('dev', ['copy', 'less', 'typescript']);
    return grunt.registerTask('default', ['copy', 'less', 'typescript', 'uglify']);
};