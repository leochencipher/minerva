import _ from 'underscore';
import 'bootstrap-select';
import 'bootstrap-select/dist/css/bootstrap-select.css';

import palettableColorbrewerMapper, { colorbrewerCategories } from '../util/palettableColorbrewerMapper';
import View from '../view';
import template from '../../templates/widgets/colorbrewerPicker.pug';
import '../../stylesheets/widgets/colorBrewerPicker.styl';

const ColorbrewerPicker = View.extend({
    events: {
        'change select.m-select-ramp': function (e) {
            var ramp = e.target.value;
            if (this.onChange) {
                this.onChange(ramp);
            }
        }
    },
    initialize(settings) {
        this.disabled = settings.disabled;
        this.onChange = settings.onChange;
        this.selectedRamp = settings.ramp || null;
        this.initialized = false;

        this.categorizedRamps =
            _.mapObject(colorbrewerCategories, (val, key) => {
                return val.map((ramp) => {
                    var [rampName] = ramp.split('_');
                    var colors = palettableColorbrewerMapper.toRampColors(ramp);
                    var html = "<ul class='m-colorbrewer-ramp'>";
                    _.each(colors, function (color, i) {
                        html += "<li style='background-color: " + color + "'/>";
                    });
                    html += '</ul>';
                    return { name: rampName, html: html };
                });
            });
    },
    render() {
        if (!this.initialized) {
            this.$el.html(template(this));
            this.$('select.m-select-ramp').selectpicker({ width: '100%', noneSelectedText: '' });
        } else {

        }
        return this;
    },
    setProperties(properties) {
        if (properties.disabled !== this.disabled) {
            this.disabled = properties.disabled;
            this.$('select.m-select-ramp').prop('disabled', this.disabled);
            this.$('select.m-select-ramp').selectpicker('refresh');
        }
    }
});

export default ColorbrewerPicker;
