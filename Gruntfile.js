'use strict';

module.exports = function(grunt) {

  grunt.initConfig({

    glyphIconDataURL: grunt.file.read('dep/glyphicon.data'),

    clean: ['build/**/*', 'dist/**/*'],

    clean_all: ['build/', 'tmp/', 'dist/**/*'],

    jshint: {
      options: {
        jshintrc: true,
        reporterOutput: ''
      },
      all: {
        src: [
          'Gruntfile.js',
          'common/ui/**/*.js',
          'common/lib/*.js',
          'common/lib/controller/*.js',
          'chrome/background.js',
          'chrome/lib/*.js',
          'firefox/data/*.js',
          'firefox/lib/*.js',
          'e2e-plugin.safariextension/lib/*.js',
          'edge/background.js',
          'edge/lib/*.js',
        ]
      }
    },

    jscs: {
      options: {
        config: ".jscs.json",
        maxErrors: 5,
        esnext: true
      },
      files: {
        src: [
          'Gruntfile.js',
          'common/ui/**/*.js',
          'common/lib/*.js',
          'common/lib/controller/*.js',
          'chrome/background.js',
          'chrome/lib/*.js',
          'firefox/data/*.js',
          'firefox/lib/*.js',
          'edge/background.js',
          'edge/lib/*.js',
        ]
      }
    },

    jsdoc: {
      dist: {
        src: ["doc/client-api/Readme.md"],
        options: {
          destination: 'build/doc',
          template: "node_modules/grunt-jsdoc/node_modules/ink-docstrap/template",
          tutorials: "doc/client-api",
          configure: "jsdoc.conf.json"
        }
      }
    },

    concat: {
      content_script: {
        options: {
          footer: '//# sourceURL=porto-cs.js'
        },
        files: [{
          src: [
            'common/ui/porto.js',
            'common/ui/inline/main-cs.js',
            'common/ui/inline/encryptFrame.js',
            'common/ui/inline/kurjunAgent.js',
            'common/ui/inline/hubTrayPort.js',
            'common/ui/inline/subutaiClient.js'
          ],
          dest: 'build/common/ui/inline/porto-cs.js'
        }]
      }
    },

    copy: {
      jquery: {
        src: 'bower_components/jquery/index.js',
        dest: 'build/common/dep/jquery.min.js'
      },
      vendor: {
        files: [
          {
            expand: true,
            cwd: 'bower_components/bootstrap/dist/',
            src: [
              'css/bootstrap.css',
              'js/bootstrap.js',
              'fonts/*'
            ],
            dest: 'build/common/dep/bootstrap/'
          },
          {
            expand: true,
            cwd: 'bower_components/bootstrap-sortable/Scripts/',
            src: 'bootstrap-sortable.js',
            dest: 'build/common/dep/bootstrap-sortable/'
          },
          {
            expand: true,
            cwd: 'bower_components/bootstrap-sortable/Contents/',
            src: 'bootstrap-sortable.css',
            dest: 'build/common/dep/bootstrap-sortable/'
          },
          {
            expand: true,
            cwd: 'bower_components/dompurify/src',
            src: 'purify.js',
            dest: 'build/common/dep/'
          },
          {
            expand: true,
            cwd: 'bower_components/requirejs/',
            src: 'require.js',
            dest: 'build/chrome/'
          },
          {
            expand: true,
            cwd: 'bower_components/qrcodejs/',
            src: 'qrcode.js',
            dest: 'build/common/dep/qrcodejs/'
          },
          {
            expand: true,
            cwd: 'bower_components/requirejs/',
            src: 'require.js',
            dest: 'build/e2e-plugin.safariextension/'
          },
          {
            expand: true,
            cwd: 'bower_components/requirejs/',
            src: 'require.js',
            dest: 'build/firefox/'
          },
          {
            expand: true,
            cwd: 'bower_components/requirejs/',
            src: 'require.js',
            dest: 'build/edge/'
          },
        ]
      },
      common: {
        files: [{
          src: [
            'common/**/*',
            '!common/ui/inline/*.js',
            'common/ui/porto.js',
            '!common/dep/wysihtml5/**/*'
          ],
          dest: 'build/'
        }]
      },
      plugins: {
        files: [{
          src: ['chrome/**/*', 'firefox/**/*', 'e2e-plugin.safariextension/**/*', 'edge/**/*'],
          dest: 'build/'
        }]
      },
      common_browser: {
        files: [
          {
            expand: true,
          src: ['common/**/*', '!common/lib/**/*'],
          cwd: 'build/',
          dest: 'build/chrome/'
        },
        {
          expand: true,
          src: '**/*',
          cwd: 'build/common/lib/',
          dest: 'build/chrome/lib/common/'
        },
        {
          expand: true,
          src: '**/*',
          cwd: 'locales',
          dest: 'build/chrome/_locales'
        },
        {
          expand: true,
          cwd: 'common/img/icons/',
          src: 'e2e_icon256x256.png',
          dest: 'build/e2e-plugin.safariextension/',
          rename: function(dest, src) {
            return dest + 'Icon.png';
          }
        },
        {
          expand: true,
          src: ['common/**/*', '!common/lib/**/*'],
          cwd: 'build/',
          dest: 'build/e2e-plugin.safariextension/'
        },
        {
          expand: true,
          src: '**/*',
          cwd: 'build/common/lib/',
          dest: 'build/e2e-plugin.safariextension/lib/common/'
        },
        {
          expand: true,
          src: '**/*',
          cwd: 'locales',
          dest: 'build/e2e-plugin.safariextension/_locales'
        },
        {
          expand: true,
          src: ['common/**/*', '!common/lib/**/*'],
          cwd: 'build/',
          dest: 'build/firefox/'
        },
        {
          expand: true,
          src: '**/*',
          cwd: 'build/common/lib/',
          dest: 'build/firefox/lib/common/'
        },
        {
          expand: true,
          src: '**/*',
          cwd: 'locales',
          dest: 'build/firefox/_locales'
          },
          {
            expand: true,
            src: ['common/**/*', '!common/lib/**/*'],
            cwd: 'build/',
            dest: 'build/edge/'
          },
          {
            expand: true,
            src: '**/*',
            cwd: 'build/common/lib/',
            dest: 'build/edge/lib/common/'
          },
          {
            expand: true,
            src: '**/*',
            cwd: 'locales',
            dest: 'build/edge/_locales'
        }
      ]
      },
      dep: {
        files: [{
          expand: true,
          flatten: true,
          src: [
            'dep/safari/openpgpjs/openpgp.js', 'dep/safari/openpgpjs/openpgp.worker.js',
            'dep/safari/openpgpjs/compression/rawdeflate.min.js',
            'dep/safari/openpgpjs/compression/rawdeflate.min.js.map'
          ],
          dest: 'build/e2e-plugin.safariextension/dep/'
        },
        {
          expand: true,
          flatten: true,
          cwd: 'node_modules/',
          src: [
            'mailreader/src/mailreader-parser.js',
            'mailreader/node_modules/emailjs-mime-parser/src/*.js',
            'mailreader/node_modules/emailjs-mime-parser/node_modules/emailjs-addressparser/src/*.js',
            'emailjs-mime-codec/src/*.js',
            'emailjs-mime-builder/src/*.js',
            'emailjs-mime-builder/node_modules/emailjs-mime-types/src/*.js'
          ],
          dest: 'build/e2e-plugin.safariextension/lib/'
        },
        {
          expand: true,
          flatten: true,
          src: 'node_modules/emailjs-mime-builder/node_modules/punycode/*.js',
          dest: 'build/e2e-plugin.safariextension/lib/',
          rename: function(dest) {
            return dest + 'emailjs-punycode.js';
          }
        },
        {
          expand: true,
          flatten: true,
          src: ['dep/chrome/openpgpjs/openpgp.js', 'dep/chrome/openpgpjs/openpgp.worker.js'],
          dest: 'build/chrome/dep/'
        },
        {
          expand: true,
          flatten: true,
          cwd: 'node_modules/',
          src: [
            'mailreader/src/mailreader-parser.js',
            'mailreader/node_modules/emailjs-mime-parser/src/*.js',
            'mailreader/node_modules/emailjs-mime-parser/node_modules/emailjs-addressparser/src/*.js',
            'emailjs-mime-codec/src/*.js',
            'emailjs-mime-builder/src/*.js',
            'emailjs-mime-builder/node_modules/emailjs-mime-types/src/*.js'
          ],
          dest: 'build/chrome/lib/'
        },
        {
          expand: true,
          flatten: true,
          src: 'node_modules/emailjs-mime-builder/node_modules/punycode/*.js',
          dest: 'build/chrome/lib/',
          rename: function(dest) {
            return dest + 'emailjs-punycode.js';
          }
        },
        {
          expand: true,
          flatten: true,
          src: ['dep/firefox/openpgpjs/openpgp.js', 'dep/firefox/openpgpjs/openpgp.worker.js'],
          dest: 'build/firefox/dep/'
        },
        {
          expand: true,
          flatten: true,
          cwd: 'node_modules/',
          src: [
            'mailreader/src/mailreader-parser.js',
            'mailreader/node_modules/emailjs-mime-parser/src/*.js',
            'mailreader/node_modules/emailjs-mime-parser/node_modules/emailjs-addressparser/src/*.js',
            'emailjs-mime-codec/src/*.js',
            'emailjs-mime-builder/src/*.js',
            'emailjs-mime-builder/node_modules/emailjs-mime-types/src/*.js'
          ],
          dest: 'build/firefox/lib/'
        },
        {
          expand: true,
          flatten: true,
          src: 'node_modules/emailjs-mime-builder/node_modules/punycode/*.js',
          dest: 'build/firefox/lib/',
          rename: function(dest) {
            return dest + 'emailjs-punycode.js';
          }
        },
        {
          expand: true,
          flatten: true,
          src: ['dep/edge/openpgpjs/openpgp.js', 'dep/edge/openpgpjs/openpgp.worker.js'],
          dest: 'build/edge/dep/'
        },
        {
          expand: true,
          flatten: true,
          cwd: 'node_modules/',
          src: [
            'mailreader/src/mailreader-parser.js',
            'mailreader/node_modules/emailjs-mime-parser/src/*.js',
            'mailreader/node_modules/emailjs-mime-parser/node_modules/emailjs-addressparser/src/*.js',
            'emailjs-mime-codec/src/*.js',
            'emailjs-mime-builder/src/*.js',
            'emailjs-mime-builder/node_modules/emailjs-mime-types/src/*.js'
          ],
          dest: 'build/edge/lib/'
        },
        {
          expand: true,
          flatten: true,
          src: 'node_modules/emailjs-mime-builder/node_modules/punycode/*.js',
          dest: 'build/edge/lib/',
          rename: function(dest) {
            return dest + 'emailjs-punycode.js';
          }
        }
      ]
      }
    },

    watch: {
      scripts: {
        files: ['Gruntfile.js', '{common,dep,chrome,firefox,e2e-plugin.safariextension,edge}/**/*'],
        tasks: ['default', 'dist-ff', 'dist-cr', 'dist-edge', 'dist-sf'],
        options: {
          spawn: false
        }
      }
    },

    compress: {
      chrome: {
        options: {
          mode: 'zip',
          archive: 'dist/e2e-plugin.chrome.zip',
          pretty: true
        },
        files: [{
          expand: true,
          src: ['chrome/**/*', 'chrome/!**/.*'],
          cwd: 'build/'
        }]
      },
      safari: {
        options: {
          mode: 'zip',
          archive: 'dist/e2e-plugin.safariextension.zip',
          pretty: true
        },
        files: [{
          expand: true,
          src: ['e2e-plugin.safariextension/**/*', 'e2e-plugin.safariextension/!**/.*'],
          cwd: 'build/'
        }]
      },
      edge: {
        options: {
          mode: 'zip',
          archive: 'dist/e2e-plugin.edge.zip',
          pretty: true
        },
        files: [{
          expand: true,
          src: ['edge/**/*', 'edge/!**/.*'],
          cwd: 'build/'
        }]
      }
    },

    replace: {
      bootstrap: {
        src: ['bower_components/bootstrap/dist/css/bootstrap.css'],
        dest: ['build/common/dep/bootstrap/css/bootstrap.css'],
        replacements: [{
          from: /@font-face[\.\S\s]+\.glyphicon\ {/g,
          to: "@font-face {\n  font-family:'Glyphicons Halflings';src:url('<%= glyphIconDataURL %>') format('woff')\n}\n.glyphicon {"
        },
        {
          from: '# sourceMappingURL=bootstrap.css.map',
          to: ''
        }]
      },
      build_version: {
        src: ['build/common/res/defaults.json'],
        dest: ['build/common/res/defaults.json'],
        replacements: [{
          from: /("version"\s:\s"[\d\.]+)/,
          to: '$1' + ' build: ' + (new Date()).toISOString().slice(0, 19)
        }]
      }
    },
    shell: {
      move_firefox_dist: {
        command: 'mv dist/subutai_e2e_plugin-*.zip dist/e2e-plugin.firefox.zip'
      },
      webex_build: {
        command: 'web-ext build --source-dir=build/firefox --artifacts-dir=dist'
      }
    },

    bump: {
      options: {
        commit: true,
        commitFiles: ['-a'],
        createTag: false,
        push: false,
        files: ['package.json', 'bower.json', 'chrome/manifest.json', 'firefox/manifest.json', 'e2e-plugin.safariextension/Info.plist', 'edge/manifest.json', 'common/res/defaults.json']
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-text-replace');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-compress');
  grunt.loadNpmTasks('grunt-bump');
  grunt.loadNpmTasks("grunt-jscs");
  grunt.loadNpmTasks('grunt-jsdoc');
  grunt.loadNpmTasks('grunt-shell');

  //custom tasks
  grunt.registerTask('dist-cr', ['compress:chrome']);
  grunt.registerTask('dist-crx', function() {
    grunt.util.spawn({cmd: 'sign-dist/crxmake.sh', args: ['build/chrome', 'cert/crx_signing.pem'], opts: {stdio: 'ignore'}});
  });

  grunt.registerTask('dist-ff', ['shell:webex_build', 'shell:move_firefox_dist']);
  grunt.registerTask('sign-ffa', function() {
    grunt.util.spawn({ cmd: 'sign-dist/ffa-sign.sh', args: ['cert/ffa-api-credentials.sh', 'dist/e2e-plugin.firefox.zip'] });
  });
  grunt.registerTask('dist-sf', ['compress:safari']);
  grunt.registerTask('dist-edge', ['compress:edge']);

  grunt.registerTask('copy_common', ['copy:vendor', 'copy:common', 'replace:bootstrap']);
  grunt.registerTask('final_assembly', ['copy:plugins', 'copy:common_browser', 'copy:dep']);

  grunt.registerTask('default', ['clean', 'jshint', 'jscs', 'copy:jquery', 'concat', 'copy_common', 'final_assembly']);
  grunt.registerTask('nightly', ['clean', 'jshint', 'jscs', 'copy:jquery', 'concat', 'copy_common', 'final_assembly', 'replace:build_version']);

};
