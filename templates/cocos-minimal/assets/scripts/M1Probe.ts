import {
    _decorator,
    Color,
    Component,
    Director,
    director,
    Graphics,
    Label,
    Layers,
    Node,
    UITransform,
    VERSION,
} from 'cc';
import { DEBUG, PREVIEW } from 'cc/env';

const { ccclass, disallowMultiple, property, requireComponent } = _decorator;

const CODE_REVISION = 'm1-code-v2';
const DESIGN_WIDTH = 960;
const DESIGN_HEIGHT = 640;
const BUTTON_WIDTH = 220;
const BUTTON_HEIGHT = 72;
const BUTTON_Y = 260;
const ADD_X = 340;
const RESET_X = 620;

type M1Snapshot = Readonly<{
    schemaVersion: 1;
    projectId: 'owngame-cocos-m1';
    engineVersion: string;
    codeRevision: string;
    sceneName: string;
    sceneUuid: string;
    editorMarker: string;
    count: number;
    inputCount: number;
    lastAction: 'none' | 'add-one' | 'reset';
    ready: boolean;
    design: Readonly<{
        width: number;
        height: number;
        origin: 'bottom-left';
        xAxis: 'right';
        yAxis: 'up';
        units: 'game-design-units';
    }>;
    buttons: Readonly<{
        addOne: ReturnType<typeof buttonGeometry>;
        reset: ReturnType<typeof buttonGeometry>;
    }>;
}>;

type M1ReadOnlyProbe = Readonly<{ snapshot: () => M1Snapshot }>;
type ProbeWindow = Window & { __owngameM1?: M1ReadOnlyProbe };

function buttonGeometry(x: number) {
    return Object.freeze({
        center: Object.freeze({ x, y: BUTTON_Y }),
        bounds: Object.freeze({
            x: x - BUTTON_WIDTH / 2,
            y: BUTTON_Y - BUTTON_HEIGHT / 2,
            width: BUTTON_WIDTH,
            height: BUTTON_HEIGHT,
        }),
    });
}

/** Attach to the scene's Canvas. Its UI camera must render the UI_2D layer. */
@ccclass('M1Probe')
@requireComponent(UITransform)
@disallowMultiple
export class M1Probe extends Component {
    @property({ tooltip: 'Serialized editor-edit marker shown in the UI and read-only probe.' })
    editorMarker = 'm1-before';

    private count = 0;
    private inputCount = 0;
    private lastAction: M1Snapshot['lastAction'] = 'none';
    private ready = false;
    private uiRoot: Node | null = null;
    private addButton: Node | null = null;
    private resetButton: Node | null = null;
    private markerLabel: Label | null = null;
    private countLabel: Label | null = null;
    private inputLabel: Label | null = null;
    private probe: M1ReadOnlyProbe | null = null;

    protected onLoad(): void {
        const root = this.makeNode(this.node, 'M1ProbeUI', DESIGN_WIDTH, DESIGN_HEIGHT, 0, 0);
        this.uiRoot = root;
        this.centerRoot();
        this.drawBox(root, DESIGN_WIDTH, DESIGN_HEIGHT, new Color(20, 28, 41), 0);

        this.makeLabel(root, 'OWNGAME / M1', 800, 48, 0, 208, 34, new Color(239, 245, 251));
        this.markerLabel = this.makeLabel(root, '', 840, 40, 0, 145, 24, new Color(157, 176, 197));
        this.makeLabel(root, `Code revision: ${CODE_REVISION}`, 840, 28, 0, 110, 18, new Color(157, 176, 197));
        this.countLabel = this.makeLabel(root, '', 800, 78, 0, 53, 52, new Color(239, 245, 251));

        this.addButton = this.makeButton('AddOne', 'Add one', ADD_X, new Color(70, 214, 167), new Color(14, 38, 32));
        this.resetButton = this.makeButton('Reset', 'Reset', RESET_X, new Color(47, 62, 81), new Color(239, 245, 251));
        this.addButton.on(Node.EventType.TOUCH_END, this.onAddOne, this);
        this.resetButton.on(Node.EventType.TOUCH_END, this.onReset, this);

        this.inputLabel = this.makeLabel(root, '', 840, 36, 0, -145, 20, new Color(157, 176, 197));
        this.makeLabel(root, 'Click the buttons to verify real game input.', 840, 36, 0, -205, 20, new Color(157, 176, 197));
        this.refreshLabels();

        if ((DEBUG || PREVIEW) && typeof window !== 'undefined') {
            this.probe = Object.freeze({ snapshot: () => this.snapshot() });
            Object.defineProperty(window, '__owngameM1', {
                value: this.probe,
                writable: false,
                configurable: true,
                enumerable: false,
            });
        }
        this.log('loaded');
    }

    protected onEnable(): void {
        this.ready = false;
        director.once(Director.EVENT_AFTER_DRAW, this.onFirstDraw, this);
    }

    protected onDisable(): void {
        this.ready = false;
        director.off(Director.EVENT_AFTER_DRAW, this.onFirstDraw, this);
    }

    protected lateUpdate(): void {
        // Keep the fixed design surface centered if the Canvas adapts to the viewport.
        this.centerRoot();
        if (this.markerLabel) {
            const text = `Editor marker: ${this.editorMarker}`;
            if (this.markerLabel.string !== text) this.markerLabel.string = text;
        }
    }

    protected onDestroy(): void {
        this.ready = false;
        director.off(Director.EVENT_AFTER_DRAW, this.onFirstDraw, this);
        this.addButton?.off(Node.EventType.TOUCH_END, this.onAddOne, this);
        this.resetButton?.off(Node.EventType.TOUCH_END, this.onReset, this);
        if (typeof window !== 'undefined' && (window as ProbeWindow).__owngameM1 === this.probe) {
            delete (window as ProbeWindow).__owngameM1;
        }
        this.probe = null;
        if (this.uiRoot?.isValid) this.uiRoot.destroy();
        this.uiRoot = null;
        this.log('destroyed');
    }

    private onFirstDraw(): void {
        this.ready = true;
        this.log('ready');
    }

    private onAddOne(): void {
        if (!this.ready || !this.enabledInHierarchy) return;
        this.count += 1;
        this.inputCount += 1;
        this.lastAction = 'add-one';
        this.refreshLabels();
        this.log('add-one');
    }

    private onReset(): void {
        if (!this.ready || !this.enabledInHierarchy) return;
        this.count = 0;
        // Monotonic event count: Reset is also an observed input, not a fresh run.
        this.inputCount += 1;
        this.lastAction = 'reset';
        this.refreshLabels();
        this.log('reset');
    }

    private snapshot(): M1Snapshot {
        return Object.freeze({
            schemaVersion: 1,
            projectId: 'owngame-cocos-m1',
            engineVersion: VERSION,
            codeRevision: CODE_REVISION,
            sceneName: this.node.scene?.name ?? '',
            sceneUuid: this.node.scene?.uuid ?? '',
            editorMarker: this.editorMarker,
            count: this.count,
            inputCount: this.inputCount,
            lastAction: this.lastAction,
            ready: this.ready && this.enabledInHierarchy && !!this.uiRoot?.activeInHierarchy,
            design: Object.freeze({
                width: DESIGN_WIDTH,
                height: DESIGN_HEIGHT,
                origin: 'bottom-left',
                xAxis: 'right',
                yAxis: 'up',
                units: 'game-design-units',
            }),
            buttons: Object.freeze({ addOne: buttonGeometry(ADD_X), reset: buttonGeometry(RESET_X) }),
        });
    }

    private centerRoot(): void {
        const canvasTransform = this.node.getComponent(UITransform);
        if (!canvasTransform || !this.uiRoot) return;
        this.uiRoot.setPosition(
            (0.5 - canvasTransform.anchorX) * canvasTransform.width,
            (0.5 - canvasTransform.anchorY) * canvasTransform.height,
            0,
        );
    }

    private refreshLabels(): void {
        if (this.markerLabel) this.markerLabel.string = `Editor marker: ${this.editorMarker}`;
        if (this.countLabel) this.countLabel.string = `Count: ${this.count}`;
        if (this.inputLabel) this.inputLabel.string = `Input events: ${this.inputCount} | Last action: ${this.lastAction}`;
    }

    private makeNode(parent: Node, name: string, width: number, height: number, x: number, y: number): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        parent.addChild(node);
        const transform = node.addComponent(UITransform);
        transform.setContentSize(width, height);
        transform.setAnchorPoint(0.5, 0.5);
        node.setPosition(x, y, 0);
        return node;
    }

    private drawBox(node: Node, width: number, height: number, color: Color, radius: number): void {
        const graphics = node.addComponent(Graphics);
        graphics.fillColor = color;
        if (radius > 0) graphics.roundRect(-width / 2, -height / 2, width, height, radius);
        else graphics.rect(-width / 2, -height / 2, width, height);
        graphics.fill();
    }

    private makeLabel(parent: Node, text: string, width: number, height: number, x: number, y: number, size: number, color: Color): Label {
        const node = this.makeNode(parent, 'Label', width, height, x, y);
        const label = node.addComponent(Label);
        label.useSystemFont = true;
        label.fontFamily = 'Arial';
        label.fontSize = size;
        label.lineHeight = size + 8;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;
        label.overflow = Label.Overflow.SHRINK;
        label.enableWrapText = false;
        label.color = color;
        label.string = text;
        return label;
    }

    private makeButton(name: string, text: string, designX: number, fill: Color, textColor: Color): Node {
        const node = this.makeNode(this.uiRoot!, name, BUTTON_WIDTH, BUTTON_HEIGHT, designX - DESIGN_WIDTH / 2, BUTTON_Y - DESIGN_HEIGHT / 2);
        this.drawBox(node, BUTTON_WIDTH, BUTTON_HEIGHT, fill, 12);
        this.makeLabel(node, text, BUTTON_WIDTH - 24, BUTTON_HEIGHT, 0, 0, 27, textColor);
        return node;
    }

    private log(action: string): void {
        console.log(`[M1] ${action}`, JSON.stringify({
            engineVersion: VERSION,
            codeRevision: CODE_REVISION,
            editorMarker: this.editorMarker,
            count: this.count,
            inputCount: this.inputCount,
            lastAction: this.lastAction,
        }));
    }
}
