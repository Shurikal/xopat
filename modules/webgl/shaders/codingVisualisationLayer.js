/**
 * Code shader
 * @class WebGLModule.CodingLayer
 */
WebGLModule.CodingLayer = class extends WebGLModule.VisualisationLayer {

    static type() {
        return "code";
    }

    static name() {
        return "GLSL Code";
    }

    static description() {
        return "use GLSL to display anything you want";
    }

    static sources() {
        return [{
            acceptsChannelCount: (x) => true,
        }];
    }

    static defaultControls = {
        fs: {
            default: {type: 'text_area', title: false,
                placeholder: "Input GLSL custom code.",
                default: this._getDefaultFSDefine()},
            accepts: (type, instance) => type === "text",
            required: {title: ""}
        },
        submit : {
            default: {type: "button", title: "Render"},
            accepts:  (type, instance) => type === "action"
        },
        editor : {
            default: {type: "button", title: "Open Editor"},
            accepts:  (type, instance) => type === "action"
        },
        opacity: false
    };

    getFragmentShaderDefinition() {
        let defined = this.loadProperty("fs", "");
        if (!defined) {
            return `
//begin do not remove this block - internally used            
${super.getFragmentShaderDefinition()}      
//end      

` + this.constructor._getDefaultFSDefine() + `

//the following function has to exist, return your output here
vec4 xo_render_${this.uid}() {
` + this._getDefaultFSExecute() + `
    return vec4(1.0, .0, .0, .5);
}
`;
        }
        return defined;
    }

    getFragmentShaderExecution() {
        return `return xo_render_${this.uid}();`;
    }

    static _getDefaultFSDefine() {
        return `// note that these have no unique name - commended out so that no collision occurs if multiple layers of code loaded
/*float myValue = 0.3;
vec3 myFunction(in int param1, out float param2, inout bool param3) {
    param2 = float(param1); //retype param1 into param 2
    param3 = !param3; //invert param3
    return vec4(1.0).rgg; //return vec3 channels r and twice g of vec4 (swizzling) 
}*/`;
    }

    _getDefaultFSExecute() {
        let textures = [];
        for (let i = 0; i < this.texturesCount; i++) {
            textures.push(this.sampleChannel('tile_texture_coords', i, true))
        }
        return `/*Some hints:
--- how do I sample texture? which textures are available?
(note this might not work across different machines)
${textures.join("\n")};

--- what filters are requested on this layer? (note: value used is 0.123456
and the filters -if any- are applied on that number)
float filtered = ${this.filter("0.123456")}; 
*/`;
    }

    init() {
        const _this = this;
        this.storeProperty("fs", this.getFragmentShaderDefinition());
        this.fs.init();
        this.submit.init();
        this.submit.on('default', function (raw, encoded, ctx)  {
            _this._rebuild();
            _this.invalidate();
        });

        this.editor.init();
        this.editor.on('default', function(raw, encoded, ctx) {
            if (window.Dialogs?.openEditor) {
                Dialogs.openEditor(
                    'FS-editor',
                    'Fragment Shader',
                    _this.getFragmentShaderDefinition(),
                    'glsl',
                    code => {
                        _this.storeProperty("fs", code);
                        //_this.fs.init(); //update UI?
                        _this._rebuild();
                        _this.invalidate();
                    });
            } else {
                console.warn("Monaco editor and external dialog windows are part of xOpat core - this feature is missing!");
                alert("Cannot open editor: no editor available!");
            }
        });
    }

    htmlControls() {
        return [
            `<span class="blob-code"><span class="blob-code-inner pl-0">//the output of 'render_${this.uid}()' is rendered</span></span>`,
            this.fs.toHtml(false, "font-family: ui-monospace,SFMono-Regular,SF Mono,Menlo,Consolas,Liberation Mono,monospace;height: 170px;"),
            this.editor.toHtml(false, "float: left;"),
            this.submit.toHtml(),
        ].join("");
    }
};

WebGLModule.ShaderMediator.registerLayer(WebGLModule.CodingLayer);
