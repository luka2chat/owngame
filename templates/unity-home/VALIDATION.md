# 验证范围

2026-10-19，Unity **6000.3.26f1**，macOS，独立生成的 `unity-home` 项目。

已通过：

- 模板资源导入、C# 编译、场景打开、脚本引用和中文字体检查。
- 任务顺序、提前操作、重复操作、完成状态稳定性与重置。
- Play 模式下四个实际互动对象、信标点亮、交互距离限制与重置。
- CharacterController 走过四个任务点，地面不掉落、房屋碰撞阻挡。
- CLI 创建独立项目与产品标识、不覆盖已有目录、工作区路径限制。
- 本地打包产物的 MCP 模板发现与创建，模型/字体随包保留，Unity 缓存忽略规则生成。
- 工具包发布测试 6 项通过。

Unity 批处理退出码为 0，验证器输出 `HOME_RULES_OK`、`HOME_LIVE_OK`、`HOME_WALK_OK` 和 `UNITY_HOME_VALID`。命令见 README。

本次采用 `-batchmode -nographics --burst-disable-compilation`：关闭了测试进程的 Burst 优化，未执行图形渲染。自动行走和直接调用实际交互对象，不等同于真实键鼠输入测试。画面与操作手感、Web/桌面/手机构建、触屏输入和性能尚未在提取后的模板上验收。
